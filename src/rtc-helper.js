
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


const pcPeers = {};

export const getLocalStream = (isFront, callback) => {

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
  }, logError);
}

export const join = (socket, roomID) => {
  socket.emit('join', roomID, function(socketIds){
    console.log('join', socketIds);
    for (const i in socketIds) {
      const socketId = socketIds[i];
      createPC(socket, socketId, true);
    }
  });
}

export const createPC = (socket, socketId, isOffer) => {
  const pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  const createOffer = () => {
    pc.createOffer((desc) => {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
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
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
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

export const exchange = (socket, data) => {
  const fromId = data.from;
  let pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
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
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

export const leave = (socketId) => {
  console.log('leave', socketId);
  const pc = pcPeers[socketId];
  const viewIndex = pc.viewIndex;
  pc.close();
  delete pcPeers[socketId];

  // const remoteList = container.state.remoteList;
  // delete remoteList[socketId]
  // container.setState({ remoteList: remoteList });
  // container.setState({info: 'One peer leave!'});
}

const getStats = () => {
  const pc = pcPeers[Object.keys(pcPeers)[0]];
  if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
    const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
    console.log('track', track);
    pc.getStats(track, (report) => {
      console.log('getStats report', report);
    }, logError);
  }
}

export const logError = (error) => {
  console.log("logError", error);
}