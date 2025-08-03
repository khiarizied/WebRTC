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

        // Add user to server
        stompClient.send("/app/addUser", {}, localID)

        // Request current user list
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