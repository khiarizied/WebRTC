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

    // Update UI to show call is being established
    const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
    if (remoteVideoPlaceholder) {
        remoteVideoPlaceholder.innerHTML = `
            <div class="text-center text-gray-400">
                <div class="w-16 h-16 mx-auto mb-4 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                <p>Accepting call from ${remoteID}...</p>
                <p class="text-xs mt-2 opacity-75">Establishing connection</p>
            </div>
        `;
    }

    // Show notification
    showNotification(`Accepted call from ${remoteID}`, 'success');

    // Send acceptance
    stompClient.send("/app/callResponse", {}, JSON.stringify({
        "callTo": remoteID,
        "callFrom": localID,
        "type": "call_accepted"
    }));

    // Update remote video title
    const remoteVideoTitle = document.getElementById('remoteVideoTitle');
    if (remoteVideoTitle) {
        remoteVideoTitle.textContent = `${remoteID}'s Video`;
    }

    // Show call status banner
    showCallStatusBanner(2);

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

    // Update participant count display
    updateParticipantCount();

    // Show/hide call status banner
    if (participantCount > 1) {
        showCallStatusBanner(participantCount);
    } else {
        hideCallStatusBanner();
    }

    // Update video grid layout based on participant count
    if (participantCount <= 2) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'block';
        if (groupVideosContainer) groupVideosContainer.className = 'grid gap-4 transition-all duration-500';
        updateCallMode('1-on-1');
    } else if (participantCount <= 4) {
        videoGrid.className = 'grid grid-cols-2 gap-4 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) groupVideosContainer.className = 'grid grid-cols-2 gap-4 transition-all duration-500';
        updateCallMode('Group');
    } else if (participantCount <= 6) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) groupVideosContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-500';
        updateCallMode('Group');
    } else if (participantCount <= 9) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) groupVideosContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-500';
        updateCallMode('Group');
    } else if (participantCount <= 12) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) groupVideosContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 transition-all duration-500';
        updateCallMode('Group');
    } else if (participantCount <= 16) {
        videoGrid.className = 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) groupVideosContainer.className = 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 transition-all duration-500';
        updateCallMode('Group');
    } else {
        // For very large groups, use a scrolling grid with smaller video tiles
        videoGrid.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-6 transition-all duration-500';
        if (remoteVideoContainer) remoteVideoContainer.style.display = 'none';
        if (groupVideosContainer) {
            groupVideosContainer.className = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[70vh] overflow-y-auto p-2 transition-all duration-500';
            // Add a container with fixed height and scrolling for large groups
            groupVideosContainer.style.maxHeight = '70vh';
            groupVideosContainer.style.overflowY = 'auto';
        }
        updateCallMode('Large Group');
    }

    // Add participant count badge to each video container for large groups
    if (participantCount > 8) {
        addParticipantBadges();
    } else {
        removeParticipantBadges();
    }
}

function addParticipantBadges() {
    const videoContainers = document.querySelectorAll('[id^="video-container-"]');
    videoContainers.forEach(container => {
        const userId = container.id.replace('video-container-', '');
        const badge = document.createElement('div');
        badge.className = 'absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full z-10';
        badge.textContent = userId;
        badge.id = `badge-${userId}`;
        container.querySelector('.relative').appendChild(badge);
    });
}

function removeParticipantBadges() {
    const badges = document.querySelectorAll('[id^="badge-"]');
    badges.forEach(badge => badge.remove());
}

function updateParticipantCount() {
    const participantCount = peerConnections.size + 1;
    const countElement = document.getElementById('participantCount');
    if (countElement) {
        countElement.textContent = `${participantCount} participant${participantCount > 1 ? 's' : ''}`;
        countElement.className = participantCount > 1 
            ? 'text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full animate-pulse'
            : 'text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full';
    }
}

function showCallStatusBanner(participantCount) {
    const banner = document.getElementById('callStatusBanner');
    const statusMessage = document.getElementById('statusMessage');
    const statusDetails = document.getElementById('statusDetails');
    const statusIcon = document.getElementById('statusIcon');

    if (banner && statusMessage && statusDetails && statusIcon) {
        banner.className = 'mb-6 p-4 rounded-lg border-l-4 border-green-500 bg-green-50 transition-all duration-300';
        banner.classList.remove('hidden');

        statusIcon.innerHTML = '<div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>';
        statusMessage.textContent = isGroupCall ? 'Group Call Active' : 'Call Connected';
        statusDetails.textContent = `${participantCount} participants in the call`;
    }
}

function hideCallStatusBanner() {
    const banner = document.getElementById('callStatusBanner');
    if (banner) {
        banner.classList.add('hidden');
    }
}

function createVideoElement(userId, stream) {
    // Check if video element already exists
    const existingContainer = document.getElementById(`video-container-${userId}`);
    if (existingContainer) {
        console.log(`Video element for ${userId} already exists. Updating stream.`);
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement && stream) {
            videoElement.srcObject = stream;
        }
        return videoElement;
    }

    // Create new video container
    const videoContainer = document.createElement('div');

    // Adjust size based on number of participants
    const participantCount = peerConnections.size + 1;
    let containerSize = 'h-48 md:h-64';
    let textSize = 'text-sm';

    if (participantCount > 8) {
        containerSize = 'h-32 md:h-40'; // Smaller videos for large groups
        textSize = 'text-xs';
    } else if (participantCount > 4) {
        containerSize = 'h-40 md:h-52'; // Medium videos for medium groups
        textSize = 'text-xs';
    }

    videoContainer.className = `bg-white rounded-lg shadow-lg p-3 transform transition-all duration-500 opacity-0 scale-95 hover:shadow-xl ${participantCount > 8 ? 'border border-gray-200' : ''}`;
    videoContainer.id = `video-container-${userId}`;

    videoContainer.innerHTML = `
        <h3 class="text-${textSize} font-semibold text-gray-800 mb-2 flex items-center">
            <div class="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
            <svg class="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            ${userId}
            <span class="ml-auto text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Online</span>
        </h3>
        <div class="relative">
            <video id="video-${userId}" autoplay class="w-full ${containerSize} bg-gray-900 rounded-lg object-cover"></video>
            <div class="absolute top-1 left-1 bg-black bg-opacity-50 text-white text-xs px-1 py-0.5 rounded flex items-center">
                <div class="w-1.5 h-1.5 bg-green-400 rounded-full mr-1 animate-pulse"></div>
                <span class="truncate max-w-[60px]">${userId}</span>
            </div>
            <div class="absolute top-1 right-1 bg-black bg-opacity-50 text-white p-0.5 rounded-full">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
            </div>
            <div id="connection-status-${userId}" class="absolute bottom-1 left-1 bg-green-500 text-white text-xs px-1 py-0.5 rounded-full flex items-center">
                <div class="w-1.5 h-1.5 bg-white rounded-full mr-1"></div>
                Connected
            </div>
            ${participantCount > 8 ? `
            <div class="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded-full">
                <span>${peerConnections.size + 1}</span>
            </div>` : ''}
        </div>
    `;

    // Add to group videos container
    if (groupVideosContainer) {
        groupVideosContainer.appendChild(videoContainer);
    }

    // Animate in
    setTimeout(() => {
        videoContainer.classList.remove('opacity-0', 'scale-95');
        videoContainer.classList.add('opacity-100', 'scale-100');
    }, 100);

    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement && stream) {
        videoElement.srcObject = stream;

        // Show loading indicator until video starts playing
        videoElement.addEventListener('loadstart', () => {
            showVideoStatus(userId, 'Loading...', 'bg-yellow-500');
        });

        videoElement.addEventListener('playing', () => {
            showVideoStatus(userId, 'Connected', 'bg-green-500');
        });

        videoElement.addEventListener('pause', () => {
            showVideoStatus(userId, 'Paused', 'bg-gray-500');
        });

        videoElement.addEventListener('error', (e) => {
            console.error('Video error for', userId, e);
            showVideoStatus(userId, 'Error', 'bg-red-500');
        });
    }

    updateVideoGrid();
    updateParticipantCount();
    showNotification(`${userId} joined the call`, 'success');

    return videoElement;
}

function showVideoStatus(userId, status, bgColor) {
    const statusElement = document.getElementById(`connection-status-${userId}`);
    if (statusElement) {
        statusElement.className = `absolute bottom-2 left-2 ${bgColor} text-white text-xs px-2 py-1 rounded-full flex items-center transition-all duration-300`;
        statusElement.innerHTML = `
            <div class="w-2 h-2 bg-white rounded-full mr-1 ${status === 'Connected' ? 'animate-pulse' : ''}"></div>
            ${status}
        `;
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'warning' ? 'bg-yellow-500 text-white' :
        'bg-blue-500 text-white'
    }`;

    notification.innerHTML = `
        <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${type === 'success' ? 
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>' :
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
                }
            </svg>
            ${message}
        </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function removeVideoElement(userId) {
    const container = document.getElementById(`video-container-${userId}`);
    if (container) {
        container.remove();
        updateVideoGrid();
    }
}

function requestRoomList() {
    if (stompClient && isConnected) {
        // Send a message to get current room list
        console.log('Requesting room list...');
        // The server will automatically broadcast room list, so we don't need a specific endpoint
        // But we can trigger a broadcast by sending any room-related action
    }
}

function updateRoomsList(rooms) {
    const previousRoomsCount = availableRooms.size;
    availableRooms.clear();

    if (!roomsList) return;

    if (!rooms || rooms.length === 0) {
        roomsList.innerHTML = '<p class="text-gray-500 text-xs text-center">No rooms available</p>';
        return;
    }

    // Check for new rooms to show notification
    const newRooms = [];
    rooms.forEach(room => {
        if (!availableRooms.has(room.roomId)) {
            newRooms.push(room);
        }
        availableRooms.set(room.roomId, room);
    });

    // Show notification for new rooms (only if user was already connected)
    if (previousRoomsCount > 0 && newRooms.length > 0 && !currentRoomId) {
        showRoomNotification(newRooms);
    }

    // Sort rooms by participant count (rooms with more participants first)
    const sortedRooms = [...rooms].sort((a, b) => b.userCount - a.userCount);

    roomsList.innerHTML = sortedRooms.map(room => {
        // Determine room status based on participant count
        let roomStatus = '';
        let statusClass = '';

        if (room.userCount === 0) {
            roomStatus = 'Empty';
            statusClass = 'text-gray-500';
        } else if (room.userCount === 1) {
            roomStatus = 'Waiting';
            statusClass = 'text-yellow-500';
        } else if (room.userCount <= 4) {
            roomStatus = 'Active';
            statusClass = 'text-green-500';
        } else {
            roomStatus = 'Busy';
            statusClass = 'text-purple-500';
        }

        // Determine button class based on room status
        let buttonClass = 'text-xs px-2 py-1 rounded transition duration-200';
        if (room.userCount === 0) {
            buttonClass += ' bg-gray-400 hover:bg-gray-500 text-white';
        } else if (room.userCount >= 8) {
            buttonClass += ' bg-red-600 hover:bg-red-700 text-white';
        } else {
            buttonClass += ' bg-blue-600 hover:bg-blue-700 text-white';
        }

        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition duration-200 border border-gray-200">
                <div class="flex-1">
                    <div class="flex items-center">
                        <div class="text-sm font-medium text-gray-700">${room.roomId}</div>
                        <span class="ml-2 text-xs px-2 py-0.5 rounded-full ${statusClass} bg-opacity-20 ${statusClass.replace('text-', 'bg-')}">
                            ${roomStatus}
                        </span>
                    </div>
                    <div class="flex items-center mt-1 text-xs text-gray-500">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                        </svg>
                        ${room.userCount} participant${room.userCount !== 1 ? 's' : ''}
                        ${room.userCount > 0 ? `<span class="mx-2">•</span>` : ''}
                        ${room.userCount > 0 ? `<span class="text-xs">${room.userCount > 7 ? 'Room full' : 'Available'}</span>` : ''}
                    </div>
                </div>
                ${!currentRoomId ? `
                    <button onclick="joinRoom('${room.roomId}')" ${room.userCount >= 8 ? 'disabled' : ''} 
                            class="${buttonClass} ${room.userCount >= 8 ? 'opacity-50 cursor-not-allowed' : ''}">
                        ${room.userCount >= 8 ? 'Full' : 'Join'}
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');

    // Show welcome message for first-time users with available rooms
    if (rooms.length > 0 && !currentRoomId && isConnected) {
        showWelcomeRoomsMessage(rooms);
    }
}

function showRoomNotification(newRooms) {
    // Create and show a notification for new available rooms
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
    notification.innerHTML = `
        <div class="flex items-start">
            <svg class="w-6 h-6 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
                <h4 class="font-semibold mb-1">New Room${newRooms.length > 1 ? 's' : ''} Available!</h4>
                <p class="text-sm">${newRooms.map(room => room.roomId).join(', ')} ${newRooms.length > 1 ? 'are' : 'is'} now available to join.</p>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-xs underline mt-2">Dismiss</button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function showWelcomeRoomsMessage(rooms) {
    // Show welcome message only once per session
    if (sessionStorage.getItem('welcomeShown')) return;

    setTimeout(() => {
        const welcomeNotification = document.createElement('div');
        welcomeNotification.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
        welcomeNotification.innerHTML = `
            <div class="flex items-start">
                <svg class="w-6 h-6 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
                <div>
                    <h4 class="font-semibold mb-1">Welcome to Video Chat!</h4>
                    <p class="text-sm mb-2">There ${rooms.length > 1 ? 'are' : 'is'} ${rooms.length} active room${rooms.length > 1 ? 's' : ''} available to join.</p>
                    <p class="text-xs">You can join a room for group video calls or start a 1-on-1 call with any online user.</p>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-xs underline mt-2">Got it!</button>
                </div>
            </div>
        `;

        document.body.appendChild(welcomeNotification);
        sessionStorage.setItem('welcomeShown', 'true');

        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (welcomeNotification.parentElement) {
                welcomeNotification.remove();
            }
        }, 8000);
    }, 1500); // Show after a short delay to let user get oriented
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
        showNotification('Please enter a room name', 'warning');
        return;
    }

    if (!isConnected) {
        showNotification('Please connect first', 'error');
        return;
    }

    // Check if already in a room
    if (currentRoomId) {
        showNotification('You are already in a room. Please leave first.', 'warning');
        return;
    }

    console.log('Creating room:', roomName);

    // Show loading notification
    showNotification(`Creating room "${roomName}"...`, 'info');

    stompClient.send("/app/createRoom", {}, JSON.stringify({
        roomId: roomName,
        creator: localID,
        maxParticipants: 16 // Set a reasonable maximum for group calls
    }));

    roomNameInput.value = '';
}

function joinRoom(roomId) {
    if (!isConnected) {
        showNotification('Please connect first', 'error');
        return;
    }

    // Check if already in a room
    if (currentRoomId) {
        showNotification('You are already in a room. Please leave first.', 'warning');
        return;
    }

    console.log('Joining room:', roomId);

    // Show loading indicator
    showNotification(`Joining room ${roomId}...`, 'info');

    stompClient.send("/app/joinRoom", {}, JSON.stringify({
        roomId: roomId,
        userId: localID
    }));

    // Set group call mode
    isGroupCall = true;

    // Update UI immediately
    updateCallMode('Group');
    updateVideoGrid();
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
    // Check if a peer connection already exists for this user
    if (peerConnections.has(userId)) {
        console.log(`Peer connection already exists for user: ${userId}. Returning existing connection.`);
        return peerConnections.get(userId);
    }

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

        // Only create video element if it doesn't already exist
        if (!remoteStreams.has(userId)) {
            remoteStreams.set(userId, remoteStream);

            if (isGroupCall) {
                // Check if video element already exists
                const existingVideo = document.getElementById(`video-${userId}`);
                if (!existingVideo) {
                    createVideoElement(userId, remoteStream);
                } else {
                    // Update existing video element
                    existingVideo.srcObject = remoteStream;
                }
            } else {
                // For 1-on-1 calls, use the existing remote video element
                if (remoteVideo) {
                    remoteVideo.srcObject = remoteStream;
                    if (remoteVideoPlaceholder) remoteVideoPlaceholder.classList.add('hidden');
                }
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
            // Validate candidate data
            if (!candidate || !candidate.id) {
                console.warn("Received invalid candidate data from:", fromUser);
                return;
            }

            const iceCandidate = new RTCIceCandidate({
                sdpMid: candidate.sdpMid || null,
                sdpMLineIndex: candidate.label !== undefined ? candidate.label : null,
                candidate: candidate.id
            });

            await peerConnection.addIceCandidate(iceCandidate);
            console.log('Added ICE candidate from:', fromUser);
        } else {
            console.warn("No peer connection found for user:", fromUser);
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
            try {
                var o = JSON.parse(answer.body)["candidate"]

                // Check if candidate data is valid
                if (!o || !o.id) {
                    console.warn("Received invalid candidate data");
                    return;
                }

                var iceCandidate = new RTCIceCandidate({
                    sdpMid: o.sdpMid || null,
                    sdpMLineIndex: o.lable !== undefined ? o.lable : null,
                    candidate: o["id"]
                })

                localPeer.addIceCandidate(iceCandidate).catch(e => {
                    console.error("Error adding ICE candidate:", e);
                });
            } catch (e) {
                console.error("Error parsing candidate:", e);
            }
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
                        // Check if we already have a peer connection for this user
                        if (!peerConnections.has(data.userId)) {
                            setTimeout(() => createOfferForUser(data.userId), 1000);
                        } else {
                            console.log(`Peer connection already exists for user: ${data.userId}. Skipping duplicate offer creation.`);
                        }
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
            // Request available rooms immediately after connection
            requestRoomList();
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