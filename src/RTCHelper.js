
import io from 'socket.io-client';
import {
  Platform,
} from 'react-native';
import {
  RTCPeerConnection,
  // RTCMediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStreamTrack,
  getUserMedia,
} from 'react-native-webrtc';

const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};

export default class RTCHelper {
  constructor(){
    this.socket = io.connect('https://react-native-webrtc.herokuapp.com', {transports: ['websocket']});
    this.pcPeers = {};
  }
  init = (callback) => {
    this.socket.on('exchange', (data) => {
      exchange(socket, data);
    });
    this.socket.on('leave', (socketId) => {
      leave(socketId);
    });
    
    this.socket.on('connect', (data) => {
      console.log('connect');
      this.getLocalStream(true, (stream) => {
        callback(stream);
      });
    });
  }
  getLocalStream = (isFront, callback) => {

    let videoSourceId;
  
    // on android, you don't have to specify sourceId manually, just use facingMode
    // uncomment it if you want to specify
    if (Platform.OS === 'ios') {
      MediaStreamTrack.getSources(sourceInfos => {
        console.log("sourceInfos: ", sourceInfos);
  
        for (const i = 0; i < sourceInfos.length; i++) {
          const sourceInfo = sourceInfos[i];
          if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
            videoSourceId = sourceInfo.id;
          }
        }
      });
    }
    getUserMedia({
      audio: true,
      video: {
        mandatory: {
          minWidth: 640, // Provide your own width, height and frame rate here
          minHeight: 360,
          minFrameRate: 30,
        },
        facingMode: (isFront ? "user" : "environment"),
        optional: (videoSourceId ? [{sourceId: videoSourceId}] : []),
      }
    }, function (stream) {
      console.log('getUserMedia success', stream);
      callback(stream);
    }, this.logError);
  }

  join = (roomID) => {
    this.socket.emit('join', roomID, function(socketIds){
      console.log('join', socketIds);
      for (const i in socketIds) {
        const socketId = socketIds[i];
        createPC(socketId, true);
      }
    });
  }
  getPcPeers = () => this.pcPeers;
  createPC = (socketId, isOffer) => {
    const pc = new RTCPeerConnection(configuration);
    this.pcPeers[socketId] = pc;
  
    const createOffer = () => {
      pc.createOffer((desc) => {
        console.log('createOffer', desc);
        pc.setLocalDescription(desc, () => {
          console.log('setLocalDescription', pc.localDescription);
          this.socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
        }, this.logError);
      }, this.logError);
    }
  
    const createDataChannel = () => {
      if (pc.textDataChannel) {
        return;
      }
      const dataChannel = pc.createDataChannel("text");
  
      dataChannel.onerror = function (error) {
        console.log("dataChannel.onerror", error);
      };
  
      dataChannel.onmessage = function (event) {
        console.log("dataChannel.onmessage:", event.data);
        // container.receiveTextData({user: socketId, message: event.data});
      };
  
      dataChannel.onopen = function () {
        console.log('dataChannel.onopen');
        // container.setState({textRoomConnected: true});
      };
  
      dataChannel.onclose = function () {
        console.log("dataChannel.onclose");
      };
  
      pc.textDataChannel = dataChannel;
    }
  
    pc.onicecandidate = (event) => {
      console.log('onicecandidate', event.candidate);
      if (event.candidate) {
        this.socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
      }
    };
  
    pc.onnegotiationneeded = () => {
      console.log('onnegotiationneeded');
      if (isOffer) {
        createOffer();
      }
    }
  
    pc.oniceconnectionstatechange = (event) => {
      console.log('oniceconnectionstatechange', event.target.iceConnectionState);
      if (event.target.iceConnectionState === 'completed') {
        setTimeout(() => {
          getStats();
        }, 1000);
      }
      if (event.target.iceConnectionState === 'connected') {
        createDataChannel();
      }
    };
  
    pc.onsignalingstatechange = (event) => {
      console.log('onsignalingstatechange', event.target.signalingState);
    };
  
    pc.onaddstream = (event) => {
      console.log('onaddstream', event.stream);
      // container.setState({info: 'One peer join!'});
  
      // const remoteList = container.state.remoteList;
      // remoteList[socketId] = event.stream.toURL();
      // container.setState({ remoteList: remoteList });
    };
  
    pc.onremovestream = (event) => {
      console.log('onremovestream', event.stream);
    };
  
    pc.addStream(localStream);
  
    
    return pc;
  }

  exchange = (data) => {
    const fromId = data.from;
    let pc;
    if (fromId in this.pcPeers) {
      pc = this.pcPeers[fromId];
    } else {
      pc = createPC(fromId, false);
    }
  
    if (data.sdp) {
      console.log('exchange sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp),  () => {
        if (pc.remoteDescription.type == "offer")
          pc.createAnswer((desc) => {
            console.log('createAnswer', desc);
            pc.setLocalDescription(desc, () => {
              console.log('setLocalDescription', pc.localDescription);
              this.socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
            }, this.logError);
          }, this.logError);
      }, this.logError);
    } else {
      console.log('exchange candidate', data);
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }
  leave = (socketId) => {
    console.log('leave', socketId);
    const pc = this.pcPeers[socketId];
    const viewIndex = pc.viewIndex;
    pc.close();
    delete this.pcPeers[socketId];
  
    // const remoteList = container.state.remoteList;
    // delete remoteList[socketId]
    // container.setState({ remoteList: remoteList });
    // container.setState({info: 'One peer leave!'});
  }

  getStats = () => {
    const pc = this.pcPeers[Object.keys(this.pcPeers)[0]];
    if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
      const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
      console.log('track', track);
      pc.getStats(track, (report) => {
        console.log('getStats report', report);
      }, this.logError);
    }
  }

  logError = (error) => {
    console.log("logError", error);
  }
}