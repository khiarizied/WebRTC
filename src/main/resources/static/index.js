// DOM Elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const testConnection = document.getElementById("testConnection");
const callStatus = document.getElementById("callStatus");
const usersList = document.getElementById("usersList");
const userCount = document.getElementById("userCount");
const remoteVideoPlaceholder = document.getElementById("remoteVideoPlaceholder");
const endCallBtn = document.getElementById("endCallBtn");
const muteBtn = document.getElementById("muteBtn");
const videoBtn = document.getElementById("videoBtn");

// Group call DOM elements
const roomNameInput = document.getElementById("roomNameInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const currentRoom = document.getElementById("currentRoom");
const currentRoomName = document.getElementById("currentRoomName");
const roomParticipants = document.getElementById("roomParticipants");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const roomsList = document.getElementById("roomsList");
const videoGrid = document.getElementById("videoGrid");
const groupVideosContainer = document.getElementById("groupVideosContainer");
const callMode = document.getElementById("callMode");
const remoteVideoContainer = document.getElementById("remoteVideoContainer");

// State variables
let localStream;
let remoteStream;
let localPeer;
let remoteID;
let localID;
let stompClient;
let isConnected = false;
let inCall = false;
let isMuted = false;
let isVideoOff = false;
let connectedUsers = new Set();

// Group call state
let currentRoomId = null;
let isGroupCall = false;
let peerConnections = new Map(); // userId -> RTCPeerConnection
let remoteStreams = new Map(); // userId -> MediaStream
let availableRooms = new Map(); // roomId -> room info

// ICE Server Configurations
const iceServers = {
    iceServer: {
        urls: "stun:stun.l.google.com:19302"
    }
}

localPeer = new RTCPeerConnection(iceServers)

// UI Helper Functions
function updateConnectionUI(connected) {
    isConnected = connected;
    console.log('Connection status updated:', connected);
}

function updateCallUI(calling) {
    inCall = calling;
    if (calling) {
        if (callStatus) {
            callStatus.textContent = 'In Call';
            callStatus.classList.add('text-green-600');
            callStatus.classList.remove('text-gray-500');
        }
        if (endCallBtn) endCallBtn.classList.remove('hidden');
        if (muteBtn) muteBtn.classList.remove('hidden');
        if (videoBtn) videoBtn.classList.remove('hidden');
        if (remoteVideoPlaceholder) remoteVideoPlaceholder.classList.add('hidden');
    } else {
        if (callStatus) {
            callStatus.textContent = '';
            callStatus.classList.remove('text-green-600');
            callStatus.classList.add('text-gray-500');
        }
        if (endCallBtn) endCallBtn.classList.add('hidden');
        if (muteBtn) muteBtn.classList.add('hidden');
        if (videoBtn) videoBtn.classList.add('hidden');
        if (!remoteVideo.srcObject && remoteVideoPlaceholder) {
            remoteVideoPlaceholder.classList.remove('hidden');
        }
    }
}

function updateUsersList(users) {
    connectedUsers = new Set(users);
    if (userCount) userCount.textContent = users.length;

    if (!usersList) return;

    if (users.length === 0) {
        usersList.innerHTML = '<p class="text-gray-500 text-sm text-center">No users connected</p>';
        return;
    }

    usersList.innerHTML = users.map(user => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition duration-200">
            <div class="flex items-center">
                <span class="inline-block w-3 h-3 bg-green-500 rounded-full mr-3"></span>
                <span class="text-sm font-medium text-gray-700">${user}</span>
                ${user === localID ? '<span class="ml-2 text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">(You)</span>' : ''}
            </div>
            ${user !== localID ? `
                <button onclick="quickCall('${user}')" class="bg-green-600 hover:bg-green-700 text-white p-2 rounded-full transition duration-200 flex items-center justify-center" title="Call ${user}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                    </svg>
                </button>
            ` : ''}
        </div>
    `).join('');
}

function quickCall(userId) {
    if (isConnected && !inCall) {
        initiateCall(userId);
    }
}

function initiateCall(userId) {
    if (!userId || userId === localID) {
        alert('Invalid user ID');
        return;
    }

    console.log("Initiating call to:", userId);
    remoteID = userId;
    callStatus.textContent = 'Calling...';
    callStatus.classList.add('text-yellow-600');
    callStatus.classList.remove('text-gray-500');

    // Send call request
    stompClient.send("/app/call", {}, JSON.stringify({
        "callTo": userId, 
        "callFrom": localID,
        "type": "call_request"
    }));
}

function acceptCall() {
    if (!remoteID) return;

    console.log("Accepting call from:", remoteID);
    hideCallModal();

    // Send acceptance
    stompClient.send("/app/callResponse", {}, JSON.stringify({
        "callTo": remoteID,
        "callFrom": localID,
        "type": "call_accepted"
    }));

    // Start WebRTC offer
    startCall();
}

function rejectCall() {
    if (!remoteID) return;

    console.log("Rejecting call from:", remoteID);
    hideCallModal();

    // Send rejection
    stompClient.send("/app/callResponse", {}, JSON.stringify({
        "callTo": remoteID,
        "callFrom": localID,
        "type": "call_rejected"
    }));

    remoteID = null;
}

function startCall() {
    if (!localStream) {
        alert('Local media not available');
        return;
    }

    // Adding Audio and Video to Local Peer
    localStream.getTracks().forEach(track => {
        localPeer.addTrack(track, localStream);
    });

    localPeer.createOffer().then(description => {
        localPeer.setLocalDescription(description);
        console.log("Sending offer:", description);
        stompClient.send("/app/offer", {}, JSON.stringify({
            "toUser": remoteID,
            "fromUser": localID,
            "offer": description
        }));
    }).catch(error => {
        console.error("Error creating offer:", error);
    });
}

function showCallModal(callerName) {
    const modal = document.getElementById('callModal');
    const callerNameSpan = document.getElementById('callerName');
    if (modal && callerNameSpan) {
        callerNameSpan.textContent = callerName;
        modal.classList.remove('hidden');
    }
}

function hideCallModal() {
    const modal = document.getElementById('callModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Group Call UI Functions
function updateCallMode(mode) {
    if (callMode) {
        callMode.textContent = mode;
        callMode.className = mode === 'Group' 
            ? 'ml-auto text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded'
            : 'ml-auto text-xs bg-gray-100 px-2 py-1 rounded';
    }
}

function updateVideoGrid() {
    const participantCount = peerConnections.size + 1; // +1 for local user

    if (participantCount <= 2) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-6';
        remoteVideoContainer.style.display = 'block';
    } else if (participantCount <= 4) {
        videoGrid.className = 'grid grid-cols-2 gap-4 mb-6';
        remoteVideoContainer.style.display = 'none';
    } else {
        videoGrid.className = 'grid grid-cols-2 md:grid-cols-3 gap-4 mb-6';
        remoteVideoContainer.style.display = 'none';
    }
}

function createVideoElement(userId, stream) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'bg-white rounded-lg shadow-lg p-4';
    videoContainer.id = `video-container-${userId}`;

    videoContainer.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            ${userId}
        </h3>
        <div class="relative">
            <video id="video-${userId}" autoplay class="w-full h-48 md:h-64 bg-gray-900 rounded-lg object-cover"></video>
            <div class="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                ${userId}
            </div>
        </div>
    `;

    groupVideosContainer.appendChild(videoContainer);

    const videoElement = document.getElementById(`video-${userId}`);
    videoElement.srcObject = stream;

    updateVideoGrid();
    return videoElement;
}

function removeVideoElement(userId) {
    const container = document.getElementById(`video-container-${userId}`);
    if (container) {
        container.remove();
        updateVideoGrid();
    }
}

function updateRoomsList(rooms) {
    availableRooms.clear();

    if (!roomsList) return;

    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = '<p class="text-gray-500 text-xs text-center">No rooms available</p>';
        return;
    }

    rooms.forEach(room => availableRooms.set(room.roomId, room));

    roomsList.innerHTML = rooms.map(room => `
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition duration-200">
            <div class="flex-1">
                <div class="text-sm font-medium text-gray-700">${room.roomId}</div>
                <div class="text-xs text-gray-500">${room.userCount} participant${room.userCount !== 1 ? 's' : ''}</div>
            </div>
            ${!currentRoomId ? `
                <button onclick="joinRoom('${room.roomId}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition duration-200">
                    Join
                </button>
            ` : ''}
        </div>
    `).join('');
}

function updateCurrentRoomUI(roomId, participants) {
    if (roomId) {
        currentRoomId = roomId;
        isGroupCall = true;
        updateCallMode('Group');

        if (currentRoom) currentRoom.classList.remove('hidden');
        if (currentRoomName) currentRoomName.textContent = roomId;
        if (roomParticipants) {
            roomParticipants.textContent = `${participants.length} participant${participants.length !== 1 ? 's' : ''}`;
        }
    } else {
        currentRoomId = null;
        isGroupCall = false;
        updateCallMode('1-on-1');

        if (currentRoom) currentRoom.classList.add('hidden');

        // Clear group videos
        if (groupVideosContainer) {
            groupVideosContainer.innerHTML = '';
        }
        updateVideoGrid();
    }
}

// Media Controls
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;
            if (muteBtn) {
                muteBtn.classList.toggle('bg-red-600', isMuted);
                muteBtn.classList.toggle('bg-gray-600', !isMuted);
                muteBtn.title = isMuted ? 'Unmute' : 'Mute';
            }
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoOff = !videoTrack.enabled;
            if (videoBtn) {
                videoBtn.classList.toggle('bg-red-600', isVideoOff);
                videoBtn.classList.toggle('bg-gray-600', !isVideoOff);
                videoBtn.title = isVideoOff ? 'Turn on camera' : 'Turn off camera';
            }
        }
    }
}

function endCall() {
    if (localPeer) {
        localPeer.close();
        localPeer = new RTCPeerConnection(iceServers);
        setupPeerConnectionHandlers();
    }

    if (remoteVideo.srcObject) {
        remoteVideo.srcObject = null;
    }

    updateCallUI(false);
    remoteID = null;
}

// Event Listeners
if (muteBtn) muteBtn.onclick = toggleMute;
if (videoBtn) videoBtn.onclick = toggleVideo;
if (endCallBtn) endCallBtn.onclick = endCall;

// Group call event listeners
if (createRoomBtn) createRoomBtn.onclick = createRoom;
if (leaveRoomBtn) leaveRoomBtn.onclick = leaveRoom;

// Group Call Functions
function createRoom() {
    const roomName = roomNameInput?.value?.trim();
    if (!roomName) {
        alert('Please enter a room name');
        return;
    }

    if (!isConnected) {
        alert('Please connect first');
        return;
    }

    console.log('Creating room:', roomName);
    stompClient.send("/app/createRoom", {}, JSON.stringify({
        roomId: roomName,
        creator: localID
    }));

    roomNameInput.value = '';
}

function joinRoom(roomId) {
    if (!isConnected) {
        alert('Please connect first');
        return;
    }

    console.log('Joining room:', roomId);
    stompClient.send("/app/joinRoom", {}, JSON.stringify({
        roomId: roomId,
        userId: localID
    }));
}

function leaveRoom() {
    if (currentRoomId) {
        console.log('Leaving room:', currentRoomId);

        // Close all peer connections
        peerConnections.forEach((pc, userId) => {
            pc.close();
            removeVideoElement(userId);
        });
        peerConnections.clear();
        remoteStreams.clear();

        stompClient.send("/app/leaveRoom", {}, localID);
        updateCurrentRoomUI(null, []);
    }
}

function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        console.log('Received remote stream from:', userId);
        const remoteStream = event.streams[0];
        remoteStreams.set(userId, remoteStream);

        if (isGroupCall) {
            createVideoElement(userId, remoteStream);
        } else {
            // For 1-on-1 calls, use the existing remote video element
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                if (remoteVideoPlaceholder) remoteVideoPlaceholder.classList.add('hidden');
            }
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            const candidateData = {
                fromUser: localID,
                toUser: userId,
                candidate: {
                    type: "candidate",
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.candidate
                }
            };

            if (isGroupCall && currentRoomId) {
                candidateData.roomId = currentRoomId;
                stompClient.send("/app/groupCandidate", {}, JSON.stringify(candidateData));
            } else {
                stompClient.send("/app/candidate", {}, JSON.stringify(candidateData));
            }
        }
    };

    peerConnections.set(userId, peerConnection);
    return peerConnection;
}

async function createOfferForUser(userId) {
    try {
        const peerConnection = createPeerConnection(userId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const offerData = {
            fromUser: localID,
            toUser: userId,
            offer: offer
        };

        if (isGroupCall && currentRoomId) {
            offerData.roomId = currentRoomId;
            stompClient.send("/app/groupOffer", {}, JSON.stringify(offerData));
        } else {
            stompClient.send("/app/offer", {}, JSON.stringify(offerData));
        }

        console.log('Sent offer to:', userId);
    } catch (error) {
        console.error('Error creating offer for user:', userId, error);
    }
}

async function handleOffer(fromUser, offer, roomId = null) {
    try {
        const peerConnection = createPeerConnection(fromUser);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        const answerData = {
            fromUser: localID,
            toUser: fromUser,
            answer: answer
        };

        if (roomId) {
            answerData.roomId = roomId;
            stompClient.send("/app/groupAnswer", {}, JSON.stringify(answerData));
        } else {
            stompClient.send("/app/answer", {}, JSON.stringify(answerData));
        }

        console.log('Sent answer to:', fromUser);
    } catch (error) {
        console.error('Error handling offer from:', fromUser, error);
    }
}

async function handleAnswer(fromUser, answer) {
    try {
        const peerConnection = peerConnections.get(fromUser);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('Set remote description for:', fromUser);
        }
    } catch (error) {
        console.error('Error handling answer from:', fromUser, error);
    }
}

async function handleCandidate(fromUser, candidate) {
    try {
        const peerConnection = peerConnections.get(fromUser);
        if (peerConnection) {
            const iceCandidate = new RTCIceCandidate({
                sdpMLineIndex: candidate.label,
                candidate: candidate.id
            });
            await peerConnection.addIceCandidate(iceCandidate);
            console.log('Added ICE candidate from:', fromUser);
        }
    } catch (error) {
        console.error('Error handling candidate from:', fromUser, error);
    }
}

function setupPeerConnectionHandlers() {
    localPeer.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        if (remoteVideoPlaceholder) remoteVideoPlaceholder.classList.add('hidden');
        updateCallUI(true);
    }

    localPeer.onicecandidate = (event) => {
        if (event.candidate && stompClient && remoteID) {
            const candidate = {
                type: "candidate",
                lable: event.candidate.sdpMLineIndex,
                id: event.candidate.candidate,
            }
            stompClient.send("/app/candidate", {}, JSON.stringify({
                "toUser": remoteID,
                "fromUser": localID,
                "candidate": candidate
            }));
        }
    }
}

setupPeerConnectionHandlers();

// Get user media
navigator.mediaDevices.getUserMedia({video: true, audio: true})
    .then(stream => {
        localStream = stream
        localVideo.srcObject = stream;

        // Auto-connect for authenticated users
        autoConnect();
    })
    .catch(error => {
        console.log(error)
        alert('Failed to access camera/microphone. Please check permissions.');
    });

// Auto-connection for authenticated users
function autoConnect() {
    if (window.currentUser && window.currentUser !== 'defaultUser') {
        localID = window.currentUser;
        console.log("Auto-connecting as: " + localID);

        // Connect to Websocket Server
        var socket = new SockJS('/websocket', {debug: false});
        stompClient = Stomp.over(socket);

        stompClient.connect({}, frame => {
        console.log('Connected to WebSocket:', frame)
        updateConnectionUI(true);

        // Subscribe to users list updates
        stompClient.subscribe('/topic/users', function (message) {
            try {
                const users = JSON.parse(message.body);
                updateUsersList(users);
            } catch (e) {
                console.error('Error parsing users list:', e);
            }
        });

        // Subscribe to testing URL
        stompClient.subscribe('/topic/testServer', function (test) {
            console.log('Received: ' + test.body);
        });

        // Subscribe to incoming calls
        stompClient.subscribe('/user/' + localID + "/topic/call", (message) => {
            try {
                const callData = JSON.parse(message.body);
                console.log("Call request received:", callData);

                if (callData.type === "call_request") {
                    remoteID = callData.callFrom;
                    showCallModal(callData.callFrom);
                }
            } catch (e) {
                // Handle old format for backward compatibility
                console.log("Call From (old format): " + message.body);
                remoteID = message.body;
                showCallModal(message.body);
            }
        });

        // Subscribe to call responses
        stompClient.subscribe('/user/' + localID + "/topic/callResponse", (message) => {
            try {
                const responseData = JSON.parse(message.body);
                console.log("Call response received:", responseData);

                if (responseData.type === "call_accepted") {
                    console.log("Call accepted by", responseData.callFrom);
                    callStatus.textContent = 'Call accepted, connecting...';
                    callStatus.classList.remove('text-yellow-600');
                    callStatus.classList.add('text-green-600');
                } else if (responseData.type === "call_rejected") {
                    console.log("Call rejected by", responseData.callFrom);
                    callStatus.textContent = 'Call rejected';
                    callStatus.classList.remove('text-yellow-600');
                    callStatus.classList.add('text-red-600');
                    setTimeout(() => {
                        updateCallUI(false);
                        remoteID = null;
                    }, 2000);
                }
            } catch (e) {
                console.error("Error parsing call response:", e);
            }
        });

        // Subscribe to offers
        stompClient.subscribe('/user/' + localID + "/topic/offer", (offer) => {
            console.log("Offer came")
            var o = JSON.parse(offer.body)["offer"]
            remoteID = JSON.parse(offer.body)["fromUser"];

            // Adding Audio and Video Local Peer
            localStream.getTracks().forEach(track => {
                localPeer.addTrack(track, localStream);
            });

            localPeer.setRemoteDescription(new RTCSessionDescription(o))
            localPeer.createAnswer().then(description => {
                localPeer.setLocalDescription(description)
                console.log("Setting Local Description", description)
                stompClient.send("/app/answer", {}, JSON.stringify({
                    "toUser": remoteID,
                    "fromUser": localID,
                    "answer": description
                }));
            })
        });

        // Subscribe to answers
        stompClient.subscribe('/user/' + localID + "/topic/answer", (answer) => {
            console.log("Answer Came")
            var o = JSON.parse(answer.body)["answer"]
            localPeer.setRemoteDescription(new RTCSessionDescription(o))
        });

        // Subscribe to ICE candidates
        stompClient.subscribe('/user/' + localID + "/topic/candidate", (answer) => {
            console.log("Candidate Came")
            var o = JSON.parse(answer.body)["candidate"]
            var iceCandidate = new RTCIceCandidate({
                sdpMLineIndex: o["lable"],
                candidate: o["id"],
            })
            localPeer.addIceCandidate(iceCandidate)
        });

        // Subscribe to group call messages
        stompClient.subscribe('/user/' + localID + "/topic/roomCreated", (message) => {
            try {
                const data = JSON.parse(message.body);
                if (data.success) {
                    console.log('Room created successfully:', data.roomId);
                    updateCurrentRoomUI(data.roomId, [localID]);
                }
            } catch (e) {
                console.error('Error parsing room created message:', e);
            }
        });

        stompClient.subscribe('/user/' + localID + "/topic/roomUpdate", (message) => {
            try {
                const data = JSON.parse(message.body);
                console.log('Room update:', data);

                if (data.type === 'userJoined' && data.roomId === currentRoomId) {
                    console.log('User joined room:', data.userId);
                    updateCurrentRoomUI(data.roomId, data.roomUsers);

                    // If this is not me joining, create offer
                    if (data.userId !== localID) {
                        setTimeout(() => createOfferForUser(data.userId), 1000);
                    }
                } else if (data.type === 'userLeft' && data.roomId === currentRoomId) {
                    console.log('User left room:', data.userId);
                    updateCurrentRoomUI(data.roomId, data.roomUsers);

                    // Clean up peer connection
                    const pc = peerConnections.get(data.userId);
                    if (pc) {
                        pc.close();
                        peerConnections.delete(data.userId);
                    }
                    remoteStreams.delete(data.userId);
                    removeVideoElement(data.userId);
                }
            } catch (e) {
                console.error('Error parsing room update:', e);
            }
        });

        stompClient.subscribe('/topic/rooms', (message) => {
            try {
                const rooms = JSON.parse(message.body);
                updateRoomsList(rooms);
            } catch (e) {
                console.error('Error parsing rooms list:', e);
            }
        });

        stompClient.subscribe('/user/' + localID + "/topic/groupOffer", (message) => {
            try {
                const data = JSON.parse(message.body);
                console.log('Group offer received from:', data.fromUser);
                handleOffer(data.fromUser, data.offer, data.roomId);
            } catch (e) {
                console.error('Error handling group offer:', e);
            }
        });

        stompClient.subscribe('/user/' + localID + "/topic/groupAnswer", (message) => {
            try {
                const data = JSON.parse(message.body);
                console.log('Group answer received from:', data.fromUser);
                handleAnswer(data.fromUser, data.answer);
            } catch (e) {
                console.error('Error handling group answer:', e);
            }
        });

        stompClient.subscribe('/user/' + localID + "/topic/groupCandidate", (message) => {
            try {
                const data = JSON.parse(message.body);
                console.log('Group candidate received from:', data.fromUser);
                handleCandidate(data.fromUser, data.candidate);
            } catch (e) {
                console.error('Error handling group candidate:', e);
            }
        });

        // Add user to server
        stompClient.send("/app/addUser", {}, localID)

        // Request current user list and room list
        setTimeout(() => {
            stompClient.send("/app/getUserList", {}, "");
        }, 500);

        }, error => {
            console.error('Failed to connect to WebSocket:', error);
            alert('Failed to connect to server. Please try again.');
            updateConnectionUI(false);
        });
    }
}



// Test connection handler
if (testConnection) {
    testConnection.onclick = () => {
        if (stompClient) {
            stompClient.send("/app/testServer", {}, "Test Server")
        }
    }
}