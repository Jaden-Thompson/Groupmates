class GroupMatesApp {
    constructor() {
        this.currentUser = null;
        this.nearbyUsers = [];
        this.captchaAnswer = 0;
        this.botDetectionScore = 0;
        this.sessionId = this.generateSessionId();
        this.sessionStart = Date.now();
        this.analytics = {
            events: [],
            pageViews: [],
            userActions: []
        };
        this.verificationCode = null;
        this.pendingPhone = null;
        this.pendingName = null;
        this.db = window.dbManager || new DatabaseManager();
        this.init();
    }

    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9) + Date.now();
    }

    trackEvent(event, data = {}) {
        const eventData = {
            event: event,
            sessionId: this.sessionId,
            userId: this.currentUser?.id || 'anonymous',
            timestamp: Date.now(),
            data: data
        };
        
        this.analytics.events.push(eventData);
        
        // Store locally for now
        const analytics = JSON.parse(localStorage.getItem('analytics') || '{}');
        if (!analytics.events) analytics.events = [];
        analytics.events.push(eventData);
        localStorage.setItem('analytics', JSON.stringify(analytics));
        
        console.log('Analytics Event:', eventData);
    }

    trackPageView(page) {
        this.trackEvent('page_view', { page: page });
    }

    trackUserAction(action, details = {}) {
        this.trackEvent('user_action', { action: action, ...details });
    }

    checkRateLimit() {
        const lastRequest = localStorage.getItem('lastRequestTime');
        const now = Date.now();
        
        if (lastRequest && (now - parseInt(lastRequest)) < 5000) {
            return false;
        }
        
        localStorage.setItem('lastRequestTime', now.toString());
        return true;
    }

    init() {
        this.bindEvents();
        this.generateCaptcha();
        this.setupBotDetection();
        this.checkExistingAuth();
        this.showScreen('welcome-screen');
    }

    checkExistingAuth() {
        const savedUser = localStorage.getItem('authenticatedUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                document.getElementById('user-display-name').textContent = this.currentUser.name;
                this.trackUserAction('auto_login', { phone: this.currentUser.phone });
                this.showScreen('location-screen');
            } catch (error) {
                localStorage.removeItem('authenticatedUser');
            }
        }
    }

    generateCaptcha() {
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        this.captchaAnswer = num1 + num2;
        document.getElementById('captcha-question').textContent = `${num1} + ${num2} = ?`;
    }

    setupBotDetection() {
        let mouseMovements = 0;
        document.addEventListener('mousemove', () => {
            mouseMovements++;
            if (mouseMovements > 5) {
                this.botDetectionScore += 1;
            }
        });

        document.addEventListener('keypress', () => {
            this.botDetectionScore += 1;
        });

        this.startTime = Date.now();
    }

    isLikelyBot() {
        const timeSpent = Date.now() - this.startTime;
        
        if (timeSpent < 3000) return true;
        if (this.botDetectionScore < 2) return true;
        
        const userAgent = navigator.userAgent.toLowerCase();
        const botKeywords = ['bot', 'crawler', 'spider', 'scraper', 'headless'];
        if (botKeywords.some(keyword => userAgent.includes(keyword))) return true;
        
        return false;
    }

    validatePhoneNumber(phone) {
        // Remove all non-digits
        const cleaned = phone.replace(/\D/g, '');
        
        // Check if it's a valid length (10-15 digits)
        if (cleaned.length < 10 || cleaned.length > 15) {
            return false;
        }
        
        // Additional validation can be added here
        return true;
    }

    formatPhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
            return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return cleaned;
    }

    bindEvents() {
        document.getElementById('send-verification-btn').addEventListener('click', () => {
            this.handleSendVerification();
        });

        document.getElementById('verify-code-btn').addEventListener('click', () => {
            this.handleVerifyCode();
        });

        document.getElementById('resend-code-btn').addEventListener('click', () => {
            this.handleResendCode();
        });

        document.getElementById('back-to-phone-btn').addEventListener('click', () => {
            this.showLoginForm();
        });

        document.getElementById('enable-location-btn').addEventListener('click', () => {
            this.requestLocation();
        });

        document.getElementById('manual-location-btn').addEventListener('click', () => {
            this.toggleManualLocation();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshNearbyUsers();
        });

        document.getElementById('manual-city').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleManualLocation();
            }
        });

        document.getElementById('verification-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleVerifyCode();
            }
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showLoginForm() {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('verification-form').classList.add('hidden');
    }

    showVerificationForm() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('verification-form').classList.remove('hidden');
    }

    async handleSendVerification() {
        try {
            const phoneNumber = document.getElementById('phone-number').value.trim();
            const displayName = document.getElementById('display-name').value.trim();
            const captchaInput = parseInt(document.getElementById('captcha-input').value);
            
            this.trackUserAction('send_verification_attempt', { hasPhone: !!phoneNumber, hasName: !!displayName });
            
            if (!phoneNumber) {
                this.showNotification('Please enter your phone number', 'warning');
                return;
            }

            if (!this.validatePhoneNumber(phoneNumber)) {
                this.showNotification('Please enter a valid phone number', 'warning');
                return;
            }

            if (!displayName) {
                this.showNotification('Please enter a display name', 'warning');
                return;
            }

            if (captchaInput !== this.captchaAnswer) {
                this.showNotification('Please solve the math problem correctly', 'warning');
                this.generateCaptcha();
                document.getElementById('captcha-input').value = '';
                this.trackUserAction('captcha_failed');
                return;
            }

            if (this.isLikelyBot()) {
                this.showNotification('Automated access detected. Please try again.', 'error');
                this.generateCaptcha();
                document.getElementById('captcha-input').value = '';
                this.trackUserAction('bot_detected');
                return;
            }

            // Store pending data
            this.pendingPhone = phoneNumber;
            this.pendingName = displayName;

            // Send SMS verification through database manager
            const smsResult = await this.db.sendVerificationSMS(phoneNumber);
            
            if (smsResult.success) {
                // For development, show mock code
                if (smsResult.mockCode) {
                    this.verificationCode = smsResult.mockCode;
                    alert(`Demo: Your verification code is ${this.verificationCode}`);
                }
                
                document.getElementById('phone-display').textContent = this.formatPhoneNumber(phoneNumber);
                this.showVerificationForm();
                this.trackUserAction('verification_sent', { phone: phoneNumber });
                this.showNotification('Verification code sent!', 'success');
            } else {
                this.showNotification('Failed to send verification code. Please try again.', 'error');
            }
            
        } catch (error) {
            this.handleError(error, 'verification');
        }
    }

    handleVerifyCode() {
        try {
            const enteredCode = document.getElementById('verification-code').value.trim();
            
            if (!enteredCode) {
                this.showNotification('Please enter the verification code', 'warning');
                return;
            }

            if (enteredCode !== this.verificationCode) {
                this.showNotification('Invalid verification code. Please try again.', 'error');
                this.trackUserAction('verification_failed');
                return;
            }

            // Create or retrieve user account
            this.createOrRetrieveAccount();
            
        } catch (error) {
            this.handleError(error, 'authentication');
        }
    }

    createOrRetrieveAccount() {
        // Check if user exists
        const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const cleanPhone = this.pendingPhone.replace(/\D/g, '');
        
        let user;
        if (users[cleanPhone]) {
            // Existing user
            user = users[cleanPhone];
            user.lastLogin = Date.now();
            this.trackUserAction('user_login', { phone: cleanPhone, returning: true });
        } else {
            // New user
            user = {
                id: 'user_' + cleanPhone + '_' + Date.now(),
                phone: cleanPhone,
                name: this.pendingName,
                createdAt: Date.now(),
                lastLogin: Date.now(),
                verified: true
            };
            users[cleanPhone] = user;
            this.trackUserAction('user_registration', { phone: cleanPhone });
        }

        // Save users database
        localStorage.setItem('registeredUsers', JSON.stringify(users));
        
        // Set current user
        this.currentUser = user;
        localStorage.setItem('authenticatedUser', JSON.stringify(user));

        document.getElementById('user-display-name').textContent = user.name;
        this.trackPageView('location_screen');
        this.showScreen('location-screen');
        this.showNotification(`Welcome ${user.name}!`, 'success');
    }

    handleResendCode() {
        if (!this.checkRateLimit()) {
            this.showNotification('Please wait before requesting another code', 'warning');
            return;
        }

        // Generate new code
        this.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        console.log(`New verification code for ${this.pendingPhone}: ${this.verificationCode}`);
        alert(`Demo: Your new verification code is ${this.verificationCode}`);
        
        this.showNotification('New verification code sent!', 'success');
        this.trackUserAction('verification_resent');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : type === 'warning' ? '#ffaa44' : '#4444ff'};
            color: ${type === 'warning' ? '#000' : '#fff'};
            padding: 1rem;
            border-radius: 8px;
            z-index: 1000;
            max-width: 300px;
            font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    handleError(error, context = 'general') {
        console.error(`Error in ${context}:`, error);
        
        // Log error to database
        if (this.db) {
            this.db.logError(error, context);
        }
        
        let userMessage = 'Something went wrong. Please try again.';
        
        switch (context) {
            case 'verification':
                userMessage = 'Unable to send verification code. Please check your phone number and try again.';
                break;
            case 'authentication':
                userMessage = 'Authentication failed. Please try again.';
                break;
            case 'location':
                userMessage = 'Unable to get your location. Please check permissions or try manual entry.';
                break;
            case 'network':
                userMessage = 'Network error. Please check your connection and try again.';
                break;
        }
        
        this.showNotification(userMessage, 'error');
        
        this.trackEvent('error', {
            context: context,
            error: error.message || 'Unknown error',
            timestamp: Date.now()
        });
    }

    requestLocation() {
        if (!this.checkRateLimit()) {
            this.showNotification('Please wait a moment before trying again', 'warning');
            return;
        }
        
        this.showScreen('loading-screen');

        if (!navigator.geolocation) {
            this.showNotification('Geolocation is not supported by this browser', 'error');
            this.showScreen('location-screen');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.handleLocationSuccess(position);
            },
            (error) => {
                this.handleLocationError(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    }

    handleLocationSuccess(position) {
        const { latitude, longitude } = position.coords;
        
        this.currentUser.location = {
            lat: latitude,
            lng: longitude,
            type: 'gps'
        };

        // Update user in database
        this.updateUserInDatabase();

        this.reverseGeocode(latitude, longitude).then(locationName => {
            document.getElementById('user-location').textContent = locationName || 'Unknown location';
            this.findNearbyUsers();
        });
    }

    handleLocationError(error) {
        console.error('Location error:', error);
        this.showScreen('location-screen');
        
        switch(error.code) {
            case error.PERMISSION_DENIED:
                this.showNotification('Location access denied. Please enable location or enter your city manually.', 'warning');
                break;
            case error.POSITION_UNAVAILABLE:
                this.showNotification('Location unavailable. Please enter your city manually.', 'warning');
                break;
            case error.TIMEOUT:
                this.showNotification('Location request timed out. Please try again or enter your city manually.', 'warning');
                break;
        }
    }

    toggleManualLocation() {
        const cityInput = document.getElementById('manual-city');
        const manualBtn = document.getElementById('manual-location-btn');
        
        if (cityInput.classList.contains('hidden')) {
            cityInput.classList.remove('hidden');
            cityInput.focus();
            manualBtn.textContent = 'Use This City';
        } else {
            this.handleManualLocation();
        }
    }

    handleManualLocation() {
        const city = document.getElementById('manual-city').value.trim();
        
        if (!city) {
            this.showNotification('Please enter a city name', 'warning');
            return;
        }

        this.showScreen('loading-screen');

        this.currentUser.location = {
            city: city,
            type: 'manual'
        };

        // Update user in database
        this.updateUserInDatabase();

        document.getElementById('user-location').textContent = city;
        this.findNearbyUsers();
    }

    updateUserInDatabase() {
        const users = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const cleanPhone = this.currentUser.phone;
        
        if (users[cleanPhone]) {
            users[cleanPhone] = { ...users[cleanPhone], ...this.currentUser };
            localStorage.setItem('registeredUsers', JSON.stringify(users));
            localStorage.setItem('authenticatedUser', JSON.stringify(this.currentUser));
        }
    }

    async reverseGeocode(lat, lng) {
        try {
            return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
        } catch (error) {
            this.handleError(error, 'location');
            return null;
        }
    }

    findNearbyUsers() {
        setTimeout(() => {
            this.nearbyUsers = this.generateMockUsers();
            this.displayNearbyUsers();
            this.generateMockRequests();
            this.displayConnectionRequests();
            this.showScreen('main-screen');
        }, 1500);
    }

    generateMockRequests() {
        if (Math.random() > 0.7) {
            const mockRequests = [
                { id: 'req_1', name: 'Sam Fitness', distance: '1.2 km', interests: ['fitness', 'running'] },
                { id: 'req_2', name: 'Alex Climber', distance: '0.8 km', interests: ['climbing', 'hiking'] }
            ];
            
            const incomingRequests = JSON.parse(localStorage.getItem('incomingRequests') || '{}');
            
            mockRequests.forEach(req => {
                if (!incomingRequests[req.id]) {
                    incomingRequests[req.id] = {
                        ...req,
                        timestamp: Date.now(),
                        status: 'pending'
                    };
                }
            });
            
            localStorage.setItem('incomingRequests', JSON.stringify(incomingRequests));
        }
    }

    displayConnectionRequests() {
        const incomingRequests = JSON.parse(localStorage.getItem('incomingRequests') || '{}');
        const pendingRequests = Object.values(incomingRequests).filter(req => req.status === 'pending');
        
        const requestsSection = document.getElementById('requests-section');
        const requestsList = document.getElementById('connection-requests');
        
        if (pendingRequests.length === 0) {
            requestsSection.style.display = 'none';
            return;
        }
        
        requestsSection.style.display = 'block';
        requestsList.innerHTML = pendingRequests.map(request => `
            <div class="request-card">
                <div class="request-info">
                    <div class="request-name">${request.name}</div>
                    <div class="request-details">${request.distance} away • ${request.interests.join(', ')}</div>
                </div>
                <div class="request-actions">
                    <button class="accept-btn" onclick="app.acceptRequest('${request.id}', '${request.name}')">Accept</button>
                    <button class="decline-btn" onclick="app.declineRequest('${request.id}')">Decline</button>
                </div>
            </div>
        `).join('');
    }

    acceptRequest(requestId, userName) {
        const incomingRequests = JSON.parse(localStorage.getItem('incomingRequests') || '{}');
        const connections = JSON.parse(localStorage.getItem('connections') || '{}');
        
        if (incomingRequests[requestId]) {
            connections[requestId] = {
                name: userName,
                timestamp: Date.now(),
                status: 'connected'
            };
            
            incomingRequests[requestId].status = 'accepted';
            
            localStorage.setItem('connections', JSON.stringify(connections));
            localStorage.setItem('incomingRequests', JSON.stringify(incomingRequests));
            
            this.displayConnectionRequests();
            this.displayNearbyUsers();
            
            this.showNotification(`You're now connected with ${userName}! You can start chatting.`, 'success');
        }
    }

    declineRequest(requestId) {
        const incomingRequests = JSON.parse(localStorage.getItem('incomingRequests') || '{}');
        
        if (incomingRequests[requestId]) {
            incomingRequests[requestId].status = 'declined';
            localStorage.setItem('incomingRequests', JSON.stringify(incomingRequests));
            
            this.displayConnectionRequests();
            this.showNotification('Connection request declined.', 'info');
        }
    }

    generateMockUsers() {
        const mockNames = [
            'Alex Runner', 'Jordan Hiker', 'Casey Cyclist', 'Morgan Climber',
            'Taylor Swimmer', 'Riley Skater', 'Quinn Dancer', 'Avery Walker'
        ];

        const interests = [
            ['fitness', 'running'], ['hiking', 'yoga'], ['cycling', 'sports'],
            ['swimming', 'dancing'], ['fitness', 'hiking'], ['running', 'cycling'],
            ['yoga', 'dancing'], ['sports', 'fitness']
        ];

        const users = [];
        const numUsers = Math.floor(Math.random() * 6) + 2;

        for (let i = 0; i < numUsers; i++) {
            const distance = Math.random() * 5 + 0.1;
            const hasPhoto = Math.random() > 0.3;
            const isVerified = hasPhoto && Math.random() > 0.2;
            
            users.push({
                id: 'user_' + Math.random().toString(36).substr(2, 9),
                name: mockNames[Math.floor(Math.random() * mockNames.length)],
                distance: distance.toFixed(1),
                lastSeen: Math.floor(Math.random() * 60) + 1,
                photo: hasPhoto ? this.generateMockPhoto() : null,
                verified: isVerified,
                interests: interests[Math.floor(Math.random() * interests.length)]
            });
        }

        return users.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    }

    generateMockPhoto() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(30, 30, 25, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👤', 30, 38);
        
        return canvas.toDataURL();
    }

    displayNearbyUsers() {
        const usersList = document.getElementById('nearby-users');
        
        if (this.nearbyUsers.length === 0) {
            usersList.innerHTML = '<div class="no-users">No GroupMates nearby right now.<br>Try refreshing in a few minutes.</div>';
            return;
        }

        usersList.innerHTML = this.nearbyUsers.map(user => {
            const connectionStatus = this.getConnectionStatus(user.id);
            let buttonText = 'Connect';
            let buttonClass = 'meetup-btn';
            let buttonAction = `app.sendMeetupRequest('${user.id}', '${user.name}')`;
            
            if (connectionStatus === 'pending') {
                buttonText = 'Pending';
                buttonClass = 'meetup-btn pending';
                buttonAction = '';
            } else if (connectionStatus === 'connected') {
                buttonText = 'Chat';
                buttonClass = 'meetup-btn connected';
                buttonAction = `app.startChat('${user.id}', '${user.name}')`;
            }
            
            return `
                <div class="user-card">
                    <div class="user-avatar">
                        ${user.photo ? `<img src="${user.photo}" alt="${user.name}" class="user-photo">` : '<div class="user-photo-placeholder">👤</div>'}
                        ${user.verified ? '<div class="verification-badge">✓</div>' : ''}
                    </div>
                    <div class="user-info-card">
                        <div class="user-name">${user.name}</div>
                        <div class="user-distance">${user.distance} km away • ${user.lastSeen}m ago</div>
                        ${user.interests ? `<div class="user-interests">${user.interests.slice(0, 2).join(', ')}</div>` : ''}
                    </div>
                    <button class="${buttonClass}" ${buttonAction ? `onclick="${buttonAction}"` : 'disabled'}>
                        ${buttonText}
                    </button>
                </div>
            `;
        }).join('');
    }

    sendMeetupRequest(userId, userName) {
        const existingConnection = this.getConnectionStatus(userId);
        if (existingConnection) {
            if (existingConnection === 'pending') {
                this.showNotification('Connection request already sent!', 'info');
                return;
            } else if (existingConnection === 'connected') {
                this.startChat(userId, userName);
                return;
            }
        }

        const btn = event.target;
        btn.textContent = 'Sent!';
        btn.disabled = true;
        
        this.storePendingRequest(userId, userName);
        
        setTimeout(() => {
            this.showNotification(`Connection request sent to ${userName}! They'll be notified and can choose to accept or decline.`, 'success');
        }, 500);

        setTimeout(() => {
            btn.textContent = 'Pending';
            btn.disabled = true;
        }, 2000);
    }

    getConnectionStatus(userId) {
        const connections = JSON.parse(localStorage.getItem('connections') || '{}');
        const pendingRequests = JSON.parse(localStorage.getItem('pendingRequests') || '{}');
        
        if (connections[userId]) return 'connected';
        if (pendingRequests[userId]) return 'pending';
        return null;
    }

    storePendingRequest(userId, userName) {
        const pendingRequests = JSON.parse(localStorage.getItem('pendingRequests') || '{}');
        pendingRequests[userId] = {
            name: userName,
            timestamp: Date.now(),
            status: 'sent'
        };
        localStorage.setItem('pendingRequests', JSON.stringify(pendingRequests));
    }

    startChat(userId, userName) {
        this.showChatScreen(userId, userName);
    }

    showChatScreen(userId, userName) {
        const chatScreen = document.createElement('div');
        chatScreen.className = 'chat-screen';
        chatScreen.innerHTML = `
            <div class="chat-header">
                <button class="back-btn" onclick="app.closeChatScreen()">← Back</button>
                <h3>${userName}</h3>
                <button class="share-info-btn" onclick="app.showShareInfo('${userId}', '${userName}')">Share Info</button>
            </div>
            <div class="chat-messages" id="chat-messages-${userId}">
                <div class="system-message">
                    You're now connected with ${userName}! Start the conversation.
                </div>
            </div>
            <div class="chat-input-container">
                <input type="text" id="chat-input-${userId}" placeholder="Type a message..." class="chat-input">
                <button onclick="app.sendMessage('${userId}')" class="send-btn">Send</button>
            </div>
        `;
        
        chatScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            z-index: 1000;
            display: flex;
            flex-direction: column;
        `;
        
        document.body.appendChild(chatScreen);
        document.getElementById(`chat-input-${userId}`).focus();
        
        this.loadChatHistory(userId);
    }

    closeChatScreen() {
        const chatScreen = document.querySelector('.chat-screen');
        if (chatScreen) {
            chatScreen.remove();
        }
    }

    sendMessage(userId) {
        const input = document.getElementById(`chat-input-${userId}`);
        const message = input.value.trim();
        
        if (!message) return;
        
        this.storeMessage(userId, message, 'sent');
        this.displayMessage(userId, message, 'sent');
        input.value = '';
        
        setTimeout(() => {
            const responses = [
                "Hey! Thanks for connecting!",
                "Great to meet you! What are you up to today?",
                "Awesome! I was just thinking about finding someone to hang out with.",
                "Perfect timing! I'm free today."
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            this.storeMessage(userId, response, 'received');
            this.displayMessage(userId, response, 'received');
        }, 1000 + Math.random() * 2000);
    }

    storeMessage(userId, message, type) {
        const messages = JSON.parse(localStorage.getItem('messages') || '{}');
        if (!messages[userId]) messages[userId] = [];
        
        messages[userId].push({
            text: message,
            type: type,
            timestamp: Date.now()
        });
        
        localStorage.setItem('messages', JSON.stringify(messages));
    }

    displayMessage(userId, message, type) {
        const messagesContainer = document.getElementById(`chat-messages-${userId}`);
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.innerHTML = `
            <div class="message-text">${message}</div>
            <div class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        `;
        
        messageElement.style.cssText = `
            margin-bottom: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            ${type === 'sent' ? 'background: #D4AF37; color: #000; margin-left: 2rem; text-align: right;' : 'background: #333; margin-right: 2rem;'}
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    loadChatHistory(userId) {
        const messages = JSON.parse(localStorage.getItem('messages') || '{}');
        if (messages[userId]) {
            messages[userId].forEach(msg => {
                this.displayMessage(userId, msg.text, msg.type);
            });
        }
    }

    showShareInfo(userId, userName) {
        const modal = document.createElement('div');
        modal.className = 'share-info-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share Contact Info with ${userName}</h3>
                    <button class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="modal-body">
                    <p>Share your contact information to continue chatting outside the app:</p>
                    <div class="info-options">
                        <label>
                            <input type="checkbox" id="share-phone"> Phone Number
                            <input type="tel" id="phone-input" placeholder="Your phone number" style="margin-left: 10px; display: none;">
                        </label>
                        <label>
                            <input type="checkbox" id="share-email"> Email Address
                            <input type="email" id="email-input" placeholder="Your email" style="margin-left: 10px; display: none;">
                        </label>
                        <label>
                            <input type="checkbox" id="share-social"> Social Media Handle
                            <input type="text" id="social-input" placeholder="@username" style="margin-left: 10px; display: none;">
                        </label>
                        <label>
                            <input type="checkbox" id="share-other"> Other
                            <input type="text" id="other-input" placeholder="Discord, Snapchat, etc." style="margin-left: 10px; display: none;">
                        </label>
                    </div>
                    <div class="modal-actions">
                        <button onclick="app.shareContactInfo('${userId}', '${userName}')" class="primary-btn">Share Selected Info</button>
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" class="secondary-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const input = this.parentElement.querySelector('input:not([type="checkbox"])');
                input.style.display = this.checked ? 'inline-block' : 'none';
                if (this.checked) input.focus();
            });
        });
    }

    shareContactInfo(userId, userName) {
        const sharedInfo = [];
        
        if (document.getElementById('share-phone').checked) {
            const phone = document.getElementById('phone-input').value;
            if (phone) sharedInfo.push(`Phone: ${phone}`);
        }
        
        if (document.getElementById('share-email').checked) {
            const email = document.getElementById('email-input').value;
            if (email) sharedInfo.push(`Email: ${email}`);
        }
        
        if (document.getElementById('share-social').checked) {
            const social = document.getElementById('social-input').value;
            if (social) sharedInfo.push(`Social: ${social}`);
        }
        
        if (document.getElementById('share-other').checked) {
            const other = document.getElementById('other-input').value;
            if (other) sharedInfo.push(`Other: ${other}`);
        }
        
        if (sharedInfo.length === 0) {
            this.showNotification('Please select at least one contact method to share.', 'warning');
            return;
        }
        
        const message = `📞 Contact Info:\n${sharedInfo.join('\n')}`;
        this.storeMessage(userId, message, 'sent');
        this.displayMessage(userId, message, 'sent');
        
        document.querySelector('.share-info-modal').remove();
        
        this.showNotification('Contact information shared! You can now connect outside the app.', 'success');
    }

    refreshNearbyUsers() {
        if (!this.checkRateLimit()) {
            this.showNotification('Please wait a moment before refreshing again', 'warning');
            return;
        }
        
        this.showScreen('loading-screen');
        this.findNearbyUsers();
    }
}

// Initialize the app
const app = new GroupMatesApp();

// Add some basic service worker for offline functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .catch(err => console.log('ServiceWorker registration failed'));
    });
}
