/**
 * Worknoon Chat Widget - Full Inbox Experience (Theme Version)
 * Connects to Node.js backend (same as plugin)
 */
(function($) {
    'use strict';

    var WorknoonChat = {
        // User state
        userId: null,
        backendUserId: null,
        userName: '',
        userEmail: '',
        isLoggedIn: false,
        jwtToken: '',
        refreshToken: '',
        isGuest: false,

        // App state
        conversations: [],
        currentConversation: null,
        messages: [],
        users: [],
        activeTab: 'all',
        searchQuery: '',
        isLoading: false,
        isWidgetOpen: false,
        socket: null,
        socketConnected: false,
        pollingInterval: null,
        unreadCount: 0,

        // View state
        currentView: 'conversations',

        // DOM elements cache
        elements: {},

        init: function() {
            console.log('WorknoonChat Theme initializing...', worknoonChatData);

            // Set initial values from WordPress
            this.userId = worknoonChatData.userId || null;
            this.backendUserId = worknoonChatData.backendUserId || null;
            this.userName = worknoonChatData.userName || '';
            this.userEmail = worknoonChatData.userEmail || '';
            this.isLoggedIn = worknoonChatData.isLoggedIn || false;
            this.jwtToken = worknoonChatData.jwtToken || '';

            // Use provided API URL or default to port 5001
            // Remove trailing slash to prevent double slashes
            this.apiUrl = (worknoonChatData.apiUrl || 'http://localhost:5001/api').replace(/\/$/, '');
            this.socketUrl = (worknoonChatData.socketUrl || 'http://localhost:5001').replace(/\/$/, '');

            console.log('API URL:', this.apiUrl);
            console.log('Socket URL:', this.socketUrl);

            this.cacheElements();
            this.bindEvents();
            this.applySettings();

            // Restore guest session if not logged in
            if (!this.isLoggedIn) {
                this.restoreGuestSession();
            }

        // Initialize socket and load data if we have a token (from WP or restored guest)
        if (this.jwtToken) {
            console.log('Token found, initializing socket and loading conversations...');
            this.initSocket();
            // Pre-load conversations so they're ready when widget opens
            this.loadConversations();
        }

        // Set up token refresh interval (refresh every 23 hours to be safe with 24h expiry)
        if (this.refreshToken) {
            this.setupTokenRefresh();
        }

        console.log('Theme widget initialized - Logged in:', this.isLoggedIn, 'Backend ID:', this.backendUserId, 'JWT:', this.jwtToken ? 'Yes' : 'No', 'IsGuest:', this.isGuest);
    },

        setupTokenRefresh: function() {
        var self = this;
        // Refresh token every 23 hours (tokens expire after 24 hours)
        setInterval(function() {
            self.refreshAccessToken();
        }, 23 * 60 * 60 * 1000); // 23 hours in milliseconds
    },

        refreshAccessToken: function() {
        var self = this;
        if (!this.refreshToken) return;

        $.ajax({
            url: this.apiUrl + '/auth/refresh',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ refreshToken: this.refreshToken }),
            success: function(response) {
                var data = response.data || response;
                if (data.accessToken) {
                    self.jwtToken = data.accessToken;
                    if (data.refreshToken) {
                        self.refreshToken = data.refreshToken;
                    }
                    self.saveGuestSession();
                    console.log('Token refreshed successfully');

                    // Reconnect socket with new token
                    if (self.socket) {
                        self.socket.disconnect();
                        self.initSocket();
                    }
                }
            },
            error: function(xhr) {
                console.error('Token refresh failed:', xhr.responseText);
                // If refresh fails, clear session and show login prompt
                if (xhr.status === 401) {
                    self.clearSession();
                    if (self.isWidgetOpen) {
                        self.showLoginPrompt();
                    }
                }
            }
        });
    },

        clearSession: function() {
        this.jwtToken = '';
        this.refreshToken = '';
        this.backendUserId = null;
        this.isGuest = false;
        this.conversations = [];
        this.currentConversation = null;
        this.messages = [];
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.socketConnected = false;
        }
        try {
            localStorage.removeItem('worknoon_chat_session');
        } catch (e) {
            console.error('Error clearing session:', e);
        }
    },

        cacheElements: function() {
            this.elements.$widget = $('#worknoon-chat-widget');
            this.elements.$container = $('#worknoon-chat-container');
            this.elements.$fab = $('#worknoon-chat-fab');
            this.elements.$badge = $('#chat-notification-badge');
            this.elements.$content = $('#worknoon-chat-content');
        },

        bindEvents: function() {
            var self = this;

            // Toggle widget
            this.elements.$fab.on('click', function() {
                self.toggleWidget();
            });

            // Close button
            this.elements.$widget.on('click', '#worknoon-chat-close', function() {
                self.closeWidget();
            });

            // Header back button
            this.elements.$widget.on('click', '.chat-back-btn', function() {
                self.showConversationsList();
            });

            // New chat button
            this.elements.$widget.on('click', '.chat-new-btn', function() {
                self.showNewChatView();
            });

        // Start conversation button (in empty state) - Auto-assign to support
        this.elements.$widget.on('click', '.chat-start-btn', function() {
            self.startAutoAssignedChat();
        });

            // Tab switching
            this.elements.$widget.on('click', '.chat-tab', function() {
                var tab = $(this).data('tab');
                self.switchTab(tab);
            });

            // Search users
            this.elements.$widget.on('input', '.chat-search-input', function() {
                self.searchQuery = $(this).val();
                self.renderUsersList();
            });

            // Start conversation with user
            this.elements.$widget.on('click', '.chat-user-item', function() {
                var userId = $(this).data('user-id');
                var role = $(this).data('role');
                self.startConversationWithUser(userId, role);
            });

            // Send message
            this.elements.$widget.on('click', '#chat-send-btn', function() {
                self.sendMessage();
            });

            // Send on Enter
            this.elements.$widget.on('keypress', '#chat-message-input', function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessage();
                }
            });

            // Auto-resize textarea
            this.elements.$widget.on('input', '#chat-message-input', function() {
                self.autoResizeTextarea(this);
            });

            // File upload
            this.elements.$widget.on('change', '#chat-file-input', function(e) {
                self.handleFileUpload(e.target.files);
            });

            // Attach button
            this.elements.$widget.on('click', '#chat-attach-btn', function() {
                $('#chat-file-input').click();
            });

            // Drag and drop support
            this.elements.$widget.on('dragover', '.chat-messages, .chat-input-area', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).addClass('drag-over');
            });

            this.elements.$widget.on('dragleave', '.chat-messages, .chat-input-area', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).removeClass('drag-over');
            });

            this.elements.$widget.on('drop', '.chat-messages, .chat-input-area', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).removeClass('drag-over');
                var files = e.originalEvent.dataTransfer.files;
                if (files.length > 0) {
                    self.handleFileUpload(files);
                }
            });

            // Conversation item click
            this.elements.$widget.on('click', '.chat-conversation-item', function() {
                var conversationId = $(this).data('conversation-id');
                self.openConversation(conversationId);
            });

            // Guest form submit
            this.elements.$widget.on('click', '#guest-submit-btn', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.submitGuestForm();
            });

            // Guest form cancel
            this.elements.$widget.on('click', '#guest-cancel-btn', function() {
                self.showLoginPrompt();
            });

            // Start as guest
            this.elements.$widget.on('click', '#start-guest-btn', function() {
                self.showGuestForm();
            });

            // Login button - for guests, show email form to restore session
            this.elements.$widget.on('click', '#login-btn', function() {
                if (worknoonChatData.allowGuestChat && !worknoonChatData.isLoggedIn) {
                    self.showGuestLoginForm();
                } else {
                    window.location.href = worknoonChatData.loginUrl;
                }
            });

            // Guest login form submit
            this.elements.$widget.on('click', '#guest-login-submit-btn', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.submitGuestLogin();
            });

            // Back to login prompt
            this.elements.$widget.on('click', '#guest-login-back-btn', function() {
                self.showLoginPrompt();
            });

            // Product chat button
            $(document).on('click', '.worknoon-product-chat-btn', function(e) {
                e.preventDefault();
                self.toggleWidget();
            });

            // Order chat button
            $(document).on('click', '.worknoon-order-chat-btn', function(e) {
                e.preventDefault();
                self.toggleWidget();
            });
        },

        applySettings: function() {
            if (worknoonChatData.primaryColor) {
                document.documentElement.style.setProperty('--chat-primary-color', worknoonChatData.primaryColor);
            }
        },

        toggleWidget: function() {
            this.isWidgetOpen = !this.isWidgetOpen;
            this.elements.$container.toggleClass('active', this.isWidgetOpen);

            if (this.isWidgetOpen) {
                this.onWidgetOpen();
            } else {
                this.onWidgetClose();
            }
        },

        closeWidget: function() {
            this.isWidgetOpen = false;
            this.elements.$container.removeClass('active');
            this.onWidgetClose();
        },

        onWidgetOpen: function() {
            // Check authentication
            if (!this.backendUserId || !this.jwtToken) {
                if (worknoonChatData.allowGuestChat) {
                    this.showLoginPrompt();
                } else {
                    this.showLoginPrompt();
                }
                return;
            }

            // Load conversations
            this.loadConversations();
            this.showConversationsList();

            // Join socket room for notifications
            if (this.socketConnected && this.socket) {
                this.socket.emit('join_user_room', this.backendUserId);
            }
        },

        onWidgetClose: function() {
            // Leave socket rooms
            if (this.socketConnected && this.socket && this.currentConversation) {
                this.socket.emit('leave_conversation', this.currentConversation._id);
            }
        },

        // ==================== VIEWS ====================

        showConversationsList: function() {
            this.currentView = 'conversations';
            this.renderConversationsView();
            this.loadConversations();
        },

        showChatView: function() {
            this.currentView = 'chat';
            this.renderChatView();
            this.loadMessages();
            this.scrollToBottom();
        },

        showNewChatView: function() {
            this.currentView = 'new-chat';
            this.renderNewChatView();
            this.loadAvailableUsers();
        },

        showGuestForm: function() {
            this.currentView = 'guest-form';
            this.renderGuestForm();
        },

        showGuestLoginForm: function() {
            this.currentView = 'guest-login-form';
            this.renderGuestLoginForm();
        },

        showLoginPrompt: function() {
            this.currentView = 'login-prompt';
            this.renderLoginPrompt();
        },

        showLoading: function(message) {
            this.elements.$content.html(
                '<div class="chat-loading">' +
                    '<div class="chat-loading-spinner"></div>' +
                    '<p>' + (message || 'Loading...') + '</p>' +
                '</div>'
            );
        },

        // ==================== RENDERING ====================

        renderConversationsView: function() {
            var listHtml = this.renderConversationsList();

            var html =
                '<div class="chat-conversations-view">' +
                    '<div class="chat-conversations-header">' +
                        '<h3>Messages</h3>' +
                        '<button class="chat-new-btn" title="New Conversation">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<line x1="12" y1="5" x2="12" y2="19"></line>' +
                                '<line x1="5" y1="12" x2="19" y2="12"></line>' +
                            '</svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="chat-conversations-list" id="chat-conversations-list">' +
                        listHtml +
                    '</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        renderConversationsList: function() {
            if (this.isLoading) {
                return '<div class="chat-loading"><div class="chat-loading-spinner"></div><p>Loading conversations...</p></div>';
            }

            if (!this.conversations || this.conversations.length === 0) {
                return '<div class="chat-empty-state">' +
                    '<div class="chat-empty-icon">💬</div>' +
                    '<p>No conversations yet</p>' +
                    '<button class="chat-btn-primary chat-start-btn">Start a Conversation</button>' +
                '</div>';
            }

            var html = '';
            var self = this;

            $.each(this.conversations, function(index, conv) {
                var otherParticipant = self.getOtherParticipant(conv);
                var lastMessage = conv.lastMessage || {};
                var isUnread = conv.unreadCount > 0;
                var time = self.formatTime(lastMessage.createdAt || conv.updatedAt);

                html +=
                    '<div class="chat-conversation-item ' + (isUnread ? 'unread' : '') + '" data-conversation-id="' + conv._id + '">' +
                        '<div class="chat-conversation-avatar">' +
                            '<div class="chat-avatar-placeholder">' + (otherParticipant.name ? otherParticipant.name.charAt(0).toUpperCase() : '?') + '</div>' +
                            (otherParticipant.isOnline ? '<span class="chat-online-indicator"></span>' : '') +
                        '</div>' +
                        '<div class="chat-conversation-info">' +
                            '<div class="chat-conversation-name">' + self.escapeHtml(otherParticipant.name || 'Unknown') + '</div>' +
                            '<div class="chat-conversation-preview">' + self.escapeHtml(lastMessage.content || 'No messages yet') + '</div>' +
                        '</div>' +
                        '<div class="chat-conversation-meta">' +
                            '<span class="chat-conversation-time">' + time + '</span>' +
                            (isUnread ? '<span class="chat-unread-badge">' + conv.unreadCount + '</span>' : '') +
                        '</div>' +
                    '</div>';
            });

            return html;
        },

        renderChatView: function() {
            if (!this.currentConversation) return;

            var otherParticipant = this.getOtherParticipant(this.currentConversation);
            var otherRole = this.getOtherParticipantRole(this.currentConversation);
            var html =
                '<div class="chat-view">' +
                    '<div class="chat-view-header">' +
                        '<button class="chat-back-btn">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<polyline points="15 18 9 12 15 6"></polyline>' +
                            '</svg>' +
                        '</button>' +
                        '<div class="chat-view-header-info">' +
                            '<div class="chat-view-avatar">' + (otherParticipant.name ? otherParticipant.name.charAt(0).toUpperCase() : '?') + '</div>' +
                            '<div class="chat-view-header-text">' +
                                '<div class="chat-view-name">' + this.escapeHtml(otherParticipant.name || 'Unknown') + '</div>' +
                                '<div class="chat-view-role">' + this.escapeHtml(otherRole) + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="chat-messages" id="chat-messages">' +
                        this.renderMessages() +
                    '</div>' +
                    '<div class="chat-typing-indicator" id="chat-typing-indicator" style="display: none;">' +
                        '<span>typing</span>' +
                        '<div class="typing-dots"><span></span><span></span><span></span></div>' +
                    '</div>' +
                    '<div class="chat-input-area">' +
                        '<input type="file" id="chat-file-input" style="display: none;" accept="image/*,video/*,.pdf,.doc,.docx,.txt">' +
                        '<button type="button" id="chat-attach-btn" class="chat-attach-btn" title="Attach file (image, PDF, doc)">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>' +
                            '</svg>' +
                        '</button>' +
                        '<textarea id="chat-message-input" placeholder="Type a message or drag & drop files here..." rows="1"></textarea>' +
                        '<button id="chat-send-btn" title="Send message">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<line x1="22" y1="2" x2="11" y2="13"></line>' +
                                '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' +
                            '</svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="chat-input-hint">📎 Click paperclip or drag & drop images, PDFs, docs (max 5MB)</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        renderNewChatView: function() {
            var tabs = [
                { id: 'all', label: 'All' },
                { id: 'agent', label: 'Support' },
                { id: 'designer', label: 'Designers' },
                { id: 'merchant', label: 'Merchants' }
            ];

            var tabsHtml = '';
            $.each(tabs, function(index, tab) {
                tabsHtml += '<button class="chat-tab ' + (tab.id === 'all' ? 'active' : '') + '" data-tab="' + tab.id + '">' + tab.label + '</button>';
            });

            var html =
                '<div class="chat-new-chat-view">' +
                    '<div class="chat-new-chat-header">' +
                        '<button class="chat-back-btn">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<polyline points="15 18 9 12 15 6"></polyline>' +
                            '</svg>' +
                        '</button>' +
                        '<h3>New Conversation</h3>' +
                    '</div>' +
                    '<div class="chat-search-box">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<circle cx="11" cy="11" r="8"></circle>' +
                            '<line x1="21" y1="21" x2="16.65" y2="16.65"></line>' +
                        '</svg>' +
                        '<input type="text" class="chat-search-input" placeholder="Search by name or email...">' +
                    '</div>' +
                    '<div class="chat-tabs">' + tabsHtml + '</div>' +
                    '<div class="chat-users-list" id="chat-users-list">' +
                        this.renderUsersList() +
                    '</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        renderUsersList: function() {
            if (this.isLoading) {
                return '<div class="chat-loading"><div class="chat-loading-spinner"></div><p>Loading users...</p></div>';
            }

            var filteredUsers = this.users.filter(function(user) {
                var matchesTab = this.activeTab === 'all' || user.role === this.activeTab;
                var matchesSearch = !this.searchQuery ||
                    (user.profile && user.profile.firstName && user.profile.firstName.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                    (user.profile && user.profile.lastName && user.profile.lastName.toLowerCase().includes(this.searchQuery.toLowerCase())) ||
                    (user.email && user.email.toLowerCase().includes(this.searchQuery.toLowerCase()));
                return matchesTab && matchesSearch;
            }.bind(this));

            if (filteredUsers.length === 0) {
                return '<div class="chat-empty-state">' +
                    '<div class="chat-empty-icon">👤</div>' +
                    '<p>No users found</p>' +
                '</div>';
            }

            var html = '';
            var self = this;

            $.each(filteredUsers, function(index, user) {
                var name = (user.profile && (user.profile.firstName || user.profile.lastName))
                    ? (user.profile.firstName || '') + ' ' + (user.profile.lastName || '')
                    : user.email || 'Unknown';
                var roleLabel = self.getRoleLabel(user.role);
                var roleIcon = self.getRoleIcon(user.role);

                html +=
                    '<div class="chat-user-item" data-user-id="' + user._id + '" data-role="' + user.role + '">' +
                        '<div class="chat-user-avatar">' +
                            '<div class="chat-avatar-placeholder">' + name.charAt(0).toUpperCase() + '</div>' +
                            (user.status && user.status.isOnline ? '<span class="chat-online-indicator"></span>' : '') +
                        '</div>' +
                        '<div class="chat-user-info">' +
                            '<div class="chat-user-name">' + self.escapeHtml(name) + '</div>' +
                            '<div class="chat-user-role">' + roleIcon + ' ' + roleLabel + '</div>' +
                        '</div>' +
                        '<button class="chat-user-chat-btn">Chat</button>' +
                    '</div>';
            });

            return html;
        },

        renderGuestForm: function() {
            var html =
                '<div class="chat-guest-view">' +
                    '<div class="chat-guest-header">' +
                        '<button class="chat-back-btn">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<polyline points="15 18 9 12 15 6"></polyline>' +
                            '</svg>' +
                        '</button>' +
                        '<h3>Quick Start</h3>' +
                    '</div>' +
                    '<div class="chat-guest-form">' +
                        '<p class="chat-guest-intro">Enter your details to start chatting</p>' +
                        '<div class="chat-form-group">' +
                            '<label>Your Name</label>' +
                            '<input type="text" id="guest-name" class="chat-input-field" placeholder="John Doe">' +
                        '</div>' +
                        '<div class="chat-form-group">' +
                            '<label>Your Email</label>' +
                            '<input type="email" id="guest-email" class="chat-input-field" placeholder="john@example.com">' +
                        '</div>' +
                        '<div class="chat-form-actions">' +
                            '<button id="guest-submit-btn" class="chat-btn-primary">Start Chat</button>' +
                            '<button id="guest-cancel-btn" class="chat-btn-secondary">Cancel</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        renderGuestLoginForm: function() {
            var html =
                '<div class="chat-guest-view">' +
                    '<div class="chat-guest-header">' +
                        '<button class="chat-back-btn" id="guest-login-back-btn">' +
                            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<polyline points="15 18 9 12 15 6"></polyline>' +
                            '</svg>' +
                        '</button>' +
                        '<h3>Continue Chat</h3>' +
                    '</div>' +
                    '<div class="chat-guest-form">' +
                        '<p class="chat-guest-intro">Enter your email to continue your previous conversation</p>' +
                        '<div class="chat-form-group">' +
                            '<label>Your Email</label>' +
                            '<input type="email" id="guest-login-email" class="chat-input-field" placeholder="john@example.com">' +
                        '</div>' +
                        '<div class="chat-form-actions">' +
                            '<button id="guest-login-submit-btn" class="chat-btn-primary">Continue</button>' +
                            '<button id="guest-login-back-btn" class="chat-btn-secondary">Back</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        submitGuestLogin: function() {
            var email = $('#guest-login-email').val().trim();

            if (!email || !this.isValidEmail(email)) {
                alert('Please enter a valid email address.');
                return;
            }

            // Prevent double submission
            if (this.isLoading) {
                return;
            }

            var self = this;
            this.isLoading = true;

            // Show loading state
            $('#guest-login-submit-btn').prop('disabled', true).text('Loading...');

            // First, try to restore session from localStorage (same device)
            try {
                var stored = localStorage.getItem('worknoon_chat_session');
                if (stored) {
                    var session = JSON.parse(stored);
                    if (session && session.userEmail === email && session.jwtToken) {
                        // Restore session from localStorage
                        self.backendUserId = session.backendUserId;
                        self.jwtToken = session.jwtToken;
                        self.refreshToken = session.refreshToken || '';
                        self.userName = session.userName || '';
                        self.userEmail = session.userEmail || '';
                        self.isGuest = true;

                        self.isLoading = false;
                        $('#guest-login-submit-btn').prop('disabled', false).text('Continue');

                        self.initSocket();
                        self.loadConversations();
                        self.showConversationsList();
                        return;
                    }
                }
            } catch (e) {
                console.error('Error checking localStorage:', e);
            }

            // If no localStorage session, try backend login-by-email (cross-device)
            $.ajax({
                url: this.apiUrl + '/guest/login-by-email',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ email: email }),
                success: function(response) {
                    self.isLoading = false;
                    $('#guest-login-submit-btn').prop('disabled', false).text('Continue');
                    console.log('Guest login by email response:', response);

                    var data = response.data || response;
                    var user = data.user;
                    var accessToken = data.accessToken;
                    var refreshToken = data.refreshToken;

                    if (user && accessToken) {
                        self.backendUserId = user._id || user.id;
                        self.jwtToken = accessToken;
                        self.refreshToken = refreshToken || '';
                        self.userName = (user.profile && user.profile.firstName) ? user.profile.firstName : user.email;
                        self.userEmail = email;
                        self.isGuest = true;

                        // Save to localStorage for future same-device access
                        self.saveGuestSession();
                        self.initSocket();
                        self.loadConversations();
                        self.showConversationsList();
                    } else {
                        alert('Failed to restore session. Please try again.');
                    }
                },
                error: function(xhr, status, error) {
                    self.isLoading = false;
                    $('#guest-login-submit-btn').prop('disabled', false).text('Continue');

                    var errorMsg = 'Failed to restore session.';
                    try {
                        var errorResponse = JSON.parse(xhr.responseText);
                        errorMsg = errorResponse.message || errorMsg;
                    } catch (e) {
                        console.error('Error parsing error response:', xhr.responseText);
                    }

                    // If user not found, suggest registering
                    if (xhr.status === 404) {
                        alert(errorMsg + '\n\nPlease click "Continue as Guest" to start a new chat.');
                        self.showGuestForm();
                    } else {
                        alert(errorMsg);
                    }
                }
            });
        },

        renderLoginPrompt: function() {
            var html =
                '<div class="chat-login-view">' +
                    '<div class="chat-login-icon">💬</div>' +
                    '<h3>Start a Conversation</h3>' +
                    '<p>Connect with our team for support, design services, or merchant inquiries.</p>' +
                    (worknoonChatData.allowGuestChat
                        ? '<button id="start-guest-btn" class="chat-btn-primary">Continue as Guest</button>' +
                          '<button id="login-btn" class="chat-btn-secondary">Log In</button>'
                        : '<button id="login-btn" class="chat-btn-primary">Log In to Chat</button>'
                    ) +
                '</div>';

            this.elements.$content.html(html);
        },

        renderMessages: function() {
            if (this.messages.length === 0) {
                return '<div class="chat-empty-messages">' +
                    '<div class="chat-empty-icon">👋</div>' +
                    '<p>Start the conversation!</p>' +
                '</div>';
            }

            var html = '';
            var self = this;
            var lastSenderId = null;

            $.each(this.messages, function(index, message) {
                // Debug logging
                console.log('Message ' + index + ':', {
                    sender: message.sender,
                    senderId: message.senderId,
                    content: message.content ? message.content.substring(0, 20) : 'empty'
                });

                // Handle both sender (populated) and senderId (string or object)
                var sender = message.sender || message.senderId;
                var senderId = sender ? (sender._id || sender.id || sender) : null;
                var isOwn = senderId === self.backendUserId;
                var messageClass = isOwn ? 'chat-message own' : 'chat-message other';
                var time = self.formatTime(message.createdAt);

                // Get sender name - priority order:
                // 1. sender.name (backend populated)
                // 2. sender.profile.firstName + lastName
                // 3. sender.email
                // 4. From conversation participants
                // 5. Fallback to "Support Agent"
                var senderName = 'Support Agent';
                if (isOwn) {
                    senderName = 'You';
                } else if (sender) {
                    if (typeof sender === 'object') {
                        // Check for name field first (backend sends this)
                        if (sender.name) {
                            senderName = sender.name;
                            console.log('Using sender.name:', senderName);
                        }
                        // Then check profile
                        else if (sender.profile && (sender.profile.firstName || sender.profile.lastName)) {
                            senderName = (sender.profile.firstName || '') + ' ' + (sender.profile.lastName || '');
                            senderName = senderName.trim();
                            console.log('Using sender.profile:', senderName);
                        }
                        // Then check email
                        else if (sender.email) {
                            senderName = sender.email;
                            console.log('Using sender.email:', senderName);
                        }
                    } else {
                        // String senderId - try to get name from current conversation participants
                        senderName = self.getSenderNameFromConversation(senderId);
                        console.log('Using conversation lookup:', senderName);
                    }
                }

                console.log('Final senderName:', senderName, 'for senderId:', senderId);

                // Show sender name only when sender changes (grouping messages)
                var showSender = senderId !== lastSenderId;
                lastSenderId = senderId;

                var senderLabel = showSender ? '<div class="chat-message-sender">' + self.escapeHtml(senderName) + '</div>' : '';

                // Handle attachments - show inline previews
                var attachmentHtml = '';
                if (message.attachments && message.attachments.length > 0) {
                    $.each(message.attachments, function(i, att) {
                        var url = att.url || att;
                        var name = att.name || 'File';
                        var type = att.type || 'file';

                        // Image - show inline preview
                        if (type === 'image' || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) {
                            attachmentHtml += '<div class="chat-attachment chat-attachment-image-wrapper">' +
                                '<img src="' + url + '" alt="' + name + '" class="chat-attachment-image" onclick="window.open(\'' + url + '\', \'_blank\')" title="Click to view full size">' +
                                '<span class="chat-attachment-name">' + name + '</span>' +
                            '</div>';
                        }
                        // Video - show inline player
                        else if (type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(name)) {
                            attachmentHtml += '<div class="chat-attachment chat-attachment-video-wrapper">' +
                                '<video controls class="chat-attachment-video" poster="">' +
                                    '<source src="' + url + '" type="video/mp4">' +
                                    'Your browser does not support the video tag.' +
                                '</video>' +
                                '<span class="chat-attachment-name">' + name + '</span>' +
                            '</div>';
                        }
                        // PDF - show inline preview (iframe for PDFs)
                        else if (type === 'pdf' || /\.pdf$/i.test(name)) {
                            attachmentHtml += '<div class="chat-attachment chat-attachment-pdf-wrapper">' +
                                '<iframe src="' + url + '" class="chat-attachment-pdf" title="' + name + '"></iframe>' +
                                '<a href="' + url + '" target="_blank" class="chat-attachment-download">📥 Download PDF</a>' +
                            '</div>';
                        }
                        // Other files - show icon with download link
                        else {
                            var fileIcon = '📎';
                            if (/\.(doc|docx)$/i.test(name)) fileIcon = '📄';
                            else if (/\.(xls|xlsx|csv)$/i.test(name)) fileIcon = '📊';
                            else if (/\.(ppt|pptx)$/i.test(name)) fileIcon = '📽️';
                            else if (/\.(zip|rar|7z)$/i.test(name)) fileIcon = '📦';
                            else if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) fileIcon = '🎵';

                            attachmentHtml += '<div class="chat-attachment chat-attachment-file-wrapper">' +
                                '<a href="' + url + '" target="_blank" class="chat-attachment-file">' +
                                    '<span class="chat-attachment-icon">' + fileIcon + '</span>' +
                                    '<span class="chat-attachment-info">' +
                                        '<span class="chat-attachment-filename">' + name + '</span>' +
                                        '<span class="chat-attachment-action">Click to download</span>' +
                                    '</span>' +
                                '</a>' +
                            '</div>';
                        }
                    });
                }

                var messageHtml =
                    '<div class="' + messageClass + '" data-message-id="' + message._id + '">' +
                        senderLabel +
                        '<div class="chat-message-bubble">' +
                            self.escapeHtml(message.content) +
                            attachmentHtml +
                        '</div>' +
                        '<div class="chat-message-meta">' +
                            '<span class="chat-message-time">' + time + '</span>' +
                            (message.status === 'sending' ? '<span class="chat-message-status">Sending...</span>' : '') +
                            (message.status === 'failed' ? '<span class="chat-message-status failed">Failed</span>' : '') +
                        '</div>' +
                    '</div>';

                console.log('Message HTML for message ' + index + ':', messageHtml.substring(0, 200));
                html += messageHtml;
            });

            console.log('Total HTML length:', html.length);
            return html;
        },

        // ==================== DATA LOADING ====================

        loadConversations: function() {
            if (!this.jwtToken) return;

            this.isLoading = true;
            this.renderConversationsList();

            var self = this;

            $.ajax({
                url: this.apiUrl + '/conversations',
                type: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken
                },
                success: function(response) {
                    self.isLoading = false;
                    console.log('Conversations loaded:', response);
                    if (response.data) {
                        self.conversations = response.data.conversations || [];
                        self.updateUnreadCount();
                        if (self.currentView === 'conversations') {
                            self.renderConversationsView(); // Re-render entire view
                        }
                    }
                },
                error: function(xhr, status, error) {
                    self.isLoading = false;
                    console.error('Failed to load conversations:', error);
                    if (self.currentView === 'conversations') {
                        self.renderConversationsView(); // Show empty state on error
                    }
                }
            });
        },

        loadAvailableUsers: function() {
            if (!this.jwtToken) return;

            this.isLoading = true;
            this.renderUsersList();

            var self = this;

            $.ajax({
                url: this.apiUrl + '/users/available',
                type: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken
                },
                success: function(response) {
                    self.isLoading = false;
                    if (response.data) {
                        self.users = response.data.users || [];
                        if (self.currentView === 'new-chat') {
                            self.renderUsersList();
                        }
                    }
                },
                error: function() {
                    self.isLoading = false;
                    if (self.currentView === 'new-chat') {
                        self.renderUsersList();
                    }
                }
            });
        },

        loadMessages: function() {
            if (!this.currentConversation || !this.jwtToken) return;

            var self = this;

            $.ajax({
                url: this.apiUrl + '/messages/conversations/' + this.currentConversation._id,
                type: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken
                },
                success: function(response) {
                    if (response.data) {
                        self.messages = response.data.messages || [];
                        if (self.currentView === 'chat') {
                            $('#chat-messages').html(self.renderMessages());
                            self.scrollToBottom();
                        }
                    }
                }
            });
        },

        // ==================== ACTIONS ====================

        openConversation: function(conversationId) {
            var conversation = this.conversations.find(function(c) { return c._id === conversationId; });
            if (!conversation) return;

            this.currentConversation = conversation;
            this.showChatView();

            // Join socket room
            if (this.socketConnected && this.socket) {
                this.socket.emit('join_conversation', conversationId);
            }

            // Mark as read
            this.markConversationRead(conversationId);
        },

        startConversationWithUser: function(userId, role) {
            if (!this.jwtToken) return;

            var self = this;
            this.isLoading = true;

            var type = role === 'designer' ? 'buyer-designer' :
                       role === 'merchant' ? 'buyer-merchant' : 'buyer-agent';

            $.ajax({
                url: this.apiUrl + '/conversations',
                type: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    participantIds: [{ userId: userId, role: role }],
                    type: type
                }),
                success: function(response) {
                    self.isLoading = false;
                    if (response.data && response.data.conversation) {
                        self.currentConversation = response.data.conversation;
                        self.showChatView();

                        // Add to conversations list
                        self.conversations.unshift(self.currentConversation);

                        if (self.socketConnected && self.socket) {
                            self.socket.emit('join_conversation', self.currentConversation._id);
                        }
                    } else {
                        alert('Failed to start conversation. Please try again.');
                    }
                },
                error: function() {
                    self.isLoading = false;
                    alert('Failed to start conversation. Please try again.');
                }
            });
        },

        sendMessage: function() {
            var $input = $('#chat-message-input');
            var content = $input.val().trim();

            if (!content) return;

            if (!this.currentConversation || !this.jwtToken) {
                alert('Please start a conversation first.');
                return;
            }

            var self = this;
            var tempId = 'temp-' + Date.now();

            // Optimistically add message
            var tempMessage = {
                _id: tempId,
                sender: { _id: this.backendUserId, name: this.userName },
                content: content,
                createdAt: new Date().toISOString(),
                status: 'sending'
            };

            this.messages.push(tempMessage);
            $('#chat-messages').html(this.renderMessages());
            this.scrollToBottom();

            $input.val('').css('height', 'auto');

            // Send via socket or REST
            if (this.socketConnected && this.socket) {
                this.socket.emit('send_message', {
                    conversationId: this.currentConversation._id,
                    content: content
                });

                this.socket.once('message_sent', function(data) {
                    self.replaceTempMessage(tempId, data.message);
                });
            } else {
                $.ajax({
                    url: this.apiUrl + '/messages',
                    type: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + this.jwtToken,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        conversationId: self.currentConversation._id,
                        content: content
                    }),
                    success: function(response) {
                        if (response.data && response.data.message) {
                            self.replaceTempMessage(tempId, response.data.message);
                        } else {
                            self.markMessageFailed(tempId);
                        }
                    },
                    error: function() {
                        self.markMessageFailed(tempId);
                    }
                });
            }
        },

        handleFileUpload: function(files) {
            if (!files || files.length === 0) return;
            if (!this.currentConversation) {
                alert('Please start a conversation first.');
                return;
            }

            var file = files[0];
            if (file.size > 5 * 1024 * 1024) {
                alert('File is too large. Maximum size is 5MB.');
                return;
            }

            var self = this;
            var tempId = 'temp-' + Date.now();

            // Show uploading indicator
            var tempMessage = {
                _id: tempId,
                sender: { _id: this.backendUserId, name: this.userName },
                content: 'Uploading ' + file.name + '...',
                createdAt: new Date().toISOString(),
                status: 'uploading',
                attachments: []
            };

            this.messages.push(tempMessage);
            $('#chat-messages').html(this.renderMessages());
            this.scrollToBottom();

            // Create FormData for file upload
            var formData = new FormData();
            formData.append('file', file);

            // Upload file directly to backend
            $.ajax({
                url: this.apiUrl + '/upload/single',
                type: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken
                },
                data: formData,
                processData: false,
                contentType: false,
                xhr: function() {
                    var xhr = new XMLHttpRequest();
                    xhr.upload.addEventListener('progress', function(e) {
                        if (e.lengthComputable) {
                            var percent = Math.round((e.loaded / e.total) * 100);
                            tempMessage.content = 'Uploading ' + file.name + '... ' + percent + '%';
                            $('#chat-messages').html(self.renderMessages());
                        }
                    });
                    return xhr;
                },
                success: function(response) {
                    console.log('[Theme] Upload response:', response);
                    if (response.data && response.data.file) {
                        var uploadResult = response.data.file;
                        var isImage = file.type.startsWith('image/') || uploadResult.type === 'image';
                        var attachment = {
                            url: uploadResult.url,
                            type: isImage ? 'image' : 'file',
                            name: file.name,
                            size: file.size
                        };

                        // Remove temp uploading message
                        self.messages = self.messages.filter(function(m) { return m._id !== tempId; });

                        // Now send message with attachment
                        self.sendMessageWithAttachment(attachment);
                    } else {
                        self.markMessageFailed(tempId);
                        alert('Failed to upload file: ' + (response.message || 'Unknown error'));
                    }
                },
                error: function(xhr, status, error) {
                    console.error('[Theme] Upload error:', error, xhr.responseText);
                    self.markMessageFailed(tempId);
                    alert('Failed to upload file. Please try again.');
                }
            });
        },

        sendMessageWithAttachment: function(attachment) {
            if (!this.currentConversation || !this.jwtToken) return;

            var self = this;

            // Create temp message with attachment
            var tempId = 'temp-' + Date.now();
            var tempMessage = {
                _id: tempId,
                sender: { _id: this.backendUserId, name: this.userName },
                content: attachment.name,
                attachments: [attachment],
                createdAt: new Date().toISOString(),
                status: 'sending'
            };

            this.messages.push(tempMessage);
            $('#chat-messages').html(self.renderMessages());
            this.scrollToBottom();

            // Send via socket or REST
            if (this.socketConnected && this.socket) {
                this.socket.emit('send_message', {
                    conversationId: this.currentConversation._id,
                    content: attachment.name,
                    attachments: [attachment]
                });

                // Listen for message confirmation
                this.socket.once('message_received', function(data) {
                    var message = data.message || data;
                    if (message.attachments && message.attachments.length > 0) {
                        self.replaceTempMessage(tempId, message);
                    }
                });
            } else {
                $.ajax({
                    url: this.apiUrl + '/messages',
                    type: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + this.jwtToken,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        conversationId: self.currentConversation._id,
                        content: attachment.name,
                        attachments: [attachment]
                    }),
                    success: function(response) {
                        if (response.data && response.data.message) {
                            self.replaceTempMessage(tempId, response.data.message);
                        } else {
                            self.markMessageFailed(tempId);
                        }
                    },
                    error: function() {
                        self.markMessageFailed(tempId);
                    }
                });
            }
        },

        submitGuestForm: function() {
            var name = $('#guest-name').val().trim();
            var email = $('#guest-email').val().trim();

            if (!name) {
                alert('Please enter your name.');
                return;
            }

            if (!email || !this.isValidEmail(email)) {
                alert('Please enter a valid email address.');
                return;
            }

            // Prevent double submission
            if (this.isLoading) {
                return;
            }

            var nameParts = name.split(' ');
            var firstName = nameParts[0] || 'Guest';
            var lastName = nameParts.slice(1).join(' ') || 'User';
            var password = 'Guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            var self = this;
            this.isLoading = true;

            // Show loading state
            $('#guest-submit-btn').prop('disabled', true).text('Creating...');

            $.ajax({
                url: this.apiUrl + '/auth/register',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    role: 'customer',
                    password: password
                }),
                success: function(response) {
                    self.isLoading = false;
                    $('#guest-submit-btn').prop('disabled', false).text('Start Chat');
                    console.log('Guest registration response:', JSON.stringify(response, null, 2));

                    // Backend returns: { success: true, message: "...", data: { user, accessToken, refreshToken } }
                    // Extract from response.data (the wrapper from successResponse)
                    var responseData = response.data || {};
                    var user = responseData.user;
                    var accessToken = responseData.accessToken;
                    var refreshToken = responseData.refreshToken;

                    console.log('Extracted user:', user);
                    console.log('Extracted accessToken:', accessToken ? 'present' : 'missing');

                    if (user && accessToken) {
                        self.backendUserId = user._id || user.id;
                        self.jwtToken = accessToken;
                        self.refreshToken = refreshToken || '';
                        self.userName = name;
                        self.userEmail = email;
                        self.isGuest = true;

                        self.saveGuestSession();
                        self.initSocket();
                        self.loadConversations();
                        self.showConversationsList();
                    } else {
                        console.error('Invalid response structure:', response);
                        alert('Registration response invalid. Please try again.');
                    }
                },
                error: function(xhr, status, error) {
                    self.isLoading = false;
                    $('#guest-submit-btn').prop('disabled', false).text('Start Chat');

                    var errorMsg = 'Failed to create guest session. Please try again.';
                    var responseText = xhr.responseText;

                    try {
                        var errorResponse = JSON.parse(responseText);
                        errorMsg = errorResponse.message || errorMsg;

                        // If email already exists, try to login instead
                        if (xhr.status === 409 || errorMsg.toLowerCase().includes('already registered')) {
                            console.log('Email already exists, attempting login...');
                            self.loginGuest(email, password, name);
                            return;
                        }
                    } catch (e) {
                        console.error('Guest registration error:', responseText);
                    }

                    alert(errorMsg);
                }
            });
        },

        loginGuest: function(email, password, name) {
            var self = this;
            this.isLoading = true;
            $('#guest-submit-btn').prop('disabled', true).text('Logging in...');

            $.ajax({
                url: this.apiUrl + '/auth/login',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    email: email,
                    password: password
                }),
                success: function(response) {
                    self.isLoading = false;
                    $('#guest-submit-btn').prop('disabled', false).text('Start Chat');
                    console.log('Guest login response:', response);

                    var data = response.data || response;
                    var user = data.user;
                    var accessToken = data.accessToken;
                    var refreshToken = data.refreshToken;

                    if (user && accessToken) {
                        self.backendUserId = user._id || user.id;
                        self.jwtToken = accessToken;
                        self.refreshToken = refreshToken || '';
                        self.userName = name || (user.profile ? user.profile.firstName : user.email);
                        self.userEmail = email;
                        self.isGuest = true;

                        self.saveGuestSession();
                        self.initSocket();
                        self.loadConversations();
                        self.showConversationsList();
                    } else {
                        alert('Login failed. Please try again.');
                    }
                },
                error: function(xhr, status, error) {
                    self.isLoading = false;
                    $('#guest-submit-btn').prop('disabled', false).text('Start Chat');
                    console.error('Guest login error:', xhr.responseText);
                    alert('This email is already registered. Please log in or use a different email.');
                }
            });
        },

        startAutoAssignedChat: function() {
            if (!this.jwtToken) return;

            var self = this;
            this.isLoading = true;
            this.showLoading('Connecting you to support...');

            // Create conversation with auto-assignment (empty participantIds triggers auto-assignment)
            $.ajax({
                url: this.apiUrl + '/conversations',
                type: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + this.jwtToken,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    type: 'buyer-agent',
                    autoAssign: true
                }),
                success: function(response) {
                    self.isLoading = false;
                    if (response.data && response.data.conversation) {
                        self.currentConversation = response.data.conversation;
                        // Add to conversations list
                        self.conversations.unshift(self.currentConversation);
                        // Show chat view immediately
                        self.showChatView();
                        // Join socket room
                        if (self.socketConnected && self.socket) {
                            self.socket.emit('join_conversation', self.currentConversation._id);
                        }
                    } else {
                        alert('Failed to start conversation. Please try again.');
                        self.showConversationsList();
                    }
                },
                error: function(xhr, status, error) {
                    self.isLoading = false;
                    var errorMessage = 'Failed to connect to support.';
                    try {
                        var response = JSON.parse(xhr.responseText);
                        errorMessage = response.message || errorMessage;
                        console.error('Auto-assignment error details:', response);
                    } catch (e) {
                        console.error('Auto-assignment error:', xhr.responseText);
                    }
                    alert(errorMessage + ' Please try again.');
                    self.showConversationsList();
                }
            });
        },

        switchTab: function(tab) {
            this.activeTab = tab;
            this.elements.$widget.find('.chat-tab').removeClass('active');
            this.elements.$widget.find('.chat-tab[data-tab="' + tab + '"]').addClass('active');
            this.renderUsersList();
        },

        // ==================== SOCKET ====================

        initSocket: function() {
            var self = this;

            if (typeof io === 'undefined' || !this.jwtToken) {
                this.startPolling();
                return;
            }

            this.socket = io(this.socketUrl, {
                transports: ['websocket', 'polling'],
                auth: { token: this.jwtToken }
            });

            this.socket.on('connect', function() {
                console.log('Socket connected');
                self.socketConnected = true;
                self.stopPolling();

                if (self.backendUserId) {
                    self.socket.emit('join_user_room', self.backendUserId);
                }
                if (self.currentConversation) {
                    self.socket.emit('join_conversation', self.currentConversation._id);
                }
            });

            this.socket.on('disconnect', function() {
                self.socketConnected = false;
                self.startPolling();
            });

            // Listen for message_received (correct event name from backend)
            this.socket.on('message_received', function(data) {
                var message = data.message || data;
                if (self.currentConversation && message.conversationId === self.currentConversation._id) {
                    // Check if message already exists
                    var exists = self.messages.some(function(m) { return m._id === message._id; });
                    if (!exists) {
                        self.messages.push(message);
                        if (self.currentView === 'chat') {
                            $('#chat-messages').html(self.renderMessages());
                            self.scrollToBottom();
                        }
                    }
                } else {
                    // New message in other conversation
                    self.updateUnreadCount();
                    self.showNotification();
                    // Refresh conversations list
                    self.loadConversations();
                }
            });

            // Also listen for new_message for backward compatibility
            this.socket.on('new_message', function(data) {
                var message = data.message || data;
                if (self.currentConversation && message.conversationId === self.currentConversation._id) {
                    var exists = self.messages.some(function(m) { return m._id === message._id; });
                    if (!exists) {
                        self.messages.push(message);
                        if (self.currentView === 'chat') {
                            $('#chat-messages').html(self.renderMessages());
                            self.scrollToBottom();
                        }
                    }
                } else {
                    self.updateUnreadCount();
                    self.showNotification();
                    self.loadConversations();
                }
            });

            this.socket.on('typing', function(data) {
                if (self.currentConversation && data.conversationId === self.currentConversation._id) {
                    $('#chat-typing-indicator').show();
                }
            });

            this.socket.on('stop_typing', function(data) {
                if (self.currentConversation && data.conversationId === self.currentConversation._id) {
                    $('#chat-typing-indicator').hide();
                }
            });
        },

        startPolling: function() {
            var self = this;
            this.pollingInterval = setInterval(function() {
                if (self.isWidgetOpen) {
                    self.loadConversations();
                    if (self.currentConversation && self.currentView === 'chat') {
                        self.loadMessages();
                    }
                }
            }, 3000);
        },

        stopPolling: function() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
        },

        // ==================== HELPERS ====================

        getOtherParticipant: function(conversation) {
            if (!conversation.participants) return { name: 'Unknown' };

            var self = this;
            var other = conversation.participants.find(function(p) {
                // Handle both string userId and object userId
                var participantId = (typeof p.userId === 'object' && p.userId !== null) ? p.userId._id : p.userId;
                return participantId && participantId !== self.backendUserId;
            });

            if (other && other.userId) {
                var user = other.userId;
                // Handle both string userId and populated user object
                if (typeof user === 'object' && user !== null) {
                    // Check for name field first (backend sends this)
                    if (user.name) {
                        return {
                            name: user.name,
                            isOnline: user.status && user.status.isOnline
                        };
                    }
                    // Then check profile
                    var name = (user.profile && (user.profile.firstName || user.profile.lastName))
                        ? (user.profile.firstName || '') + ' ' + (user.profile.lastName || '')
                        : user.email || 'Unknown';
                    return {
                        name: name.trim(),
                        isOnline: user.status && user.status.isOnline
                    };
                } else {
                    // userId is just a string ID, try to find from messages or return a better fallback
                    // Try to get name from last message sender
                    if (self.messages && self.messages.length > 0) {
                        var lastOtherMessage = self.messages.find(function(m) {
                            var sender = m.sender || m.senderId;
                            var senderId = sender ? (sender._id || sender.id || sender) : null;
                            return senderId === user;
                        });
                        if (lastOtherMessage && lastOtherMessage.sender && lastOtherMessage.sender.name) {
                            return { name: lastOtherMessage.sender.name, isOnline: false };
                        }
                    }
                    // Fallback to Support Agent instead of generic "User"
                    return { name: 'Support Agent', isOnline: false };
                }
            }
            return { name: 'Unknown' };
        },

        getOtherParticipantRole: function(conversation) {
            if (!conversation.participants) return 'Support Agent';

            var self = this;
            var other = conversation.participants.find(function(p) {
                var participantId = (typeof p.userId === 'object' && p.userId !== null) ? p.userId._id : p.userId;
                return participantId && participantId !== self.backendUserId;
            });

            if (other && other.userId) {
                var user = other.userId;
                if (typeof user === 'object' && user !== null) {
                    return this.getRoleLabel(user.role);
                } else {
                    // Try to get role from messages
                    if (self.messages && self.messages.length > 0) {
                        var lastOtherMessage = self.messages.find(function(m) {
                            var sender = m.sender || m.senderId;
                            var senderId = sender ? (sender._id || sender.id || sender) : null;
                            return senderId === user;
                        });
                        if (lastOtherMessage && lastOtherMessage.sender && lastOtherMessage.sender.role) {
                            return this.getRoleLabel(lastOtherMessage.sender.role);
                        }
                    }
                }
            }
            return 'Support Agent';
        },

        getSenderNameFromConversation: function(senderId) {
            // Try to find sender name from current conversation participants
            if (!this.currentConversation || !this.currentConversation.participants) {
                return 'User';
            }

            var participant = this.currentConversation.participants.find(function(p) {
                var pId = (typeof p.userId === 'object' && p.userId !== null) ? p.userId._id : p.userId;
                return pId === senderId;
            });

            if (participant && participant.userId) {
                var user = participant.userId;
                if (typeof user === 'object' && user !== null) {
                    if (user.profile && (user.profile.firstName || user.profile.lastName)) {
                        return (user.profile.firstName || '') + ' ' + (user.profile.lastName || '').trim();
                    }
                    return user.email || 'Support Agent';
                }
            }

            return 'User';
        },

        getRoleLabel: function(role) {
            var labels = { designer: 'Designer', merchant: 'Merchant', agent: 'Support Agent', admin: 'Admin' };
            return labels[role] || 'User';
        },

        getRoleIcon: function(role) {
            var icons = {
                designer: '🎨',
                merchant: '🏪',
                agent: '🎧',
                admin: '👤'
            };
            return icons[role] || '👤';
        },

        markConversationRead: function(conversationId) {
            var conv = this.conversations.find(function(c) { return c._id === conversationId; });
            if (conv) {
                conv.unreadCount = 0;
                this.updateUnreadCount();
            }
        },

        updateUnreadCount: function() {
            this.unreadCount = this.conversations.reduce(function(sum, c) {
                return sum + (c.unreadCount || 0);
            }, 0);

            if (this.unreadCount > 0) {
                this.elements.$badge.text(this.unreadCount).show();
            } else {
                this.elements.$badge.hide();
            }
        },

        showNotification: function() {
            var count = parseInt(this.elements.$badge.text()) || 0;
            this.elements.$badge.text(count + 1).show();
        },

        replaceTempMessage: function(tempId, message) {
            var index = this.messages.findIndex(function(m) { return m._id === tempId; });
            if (index !== -1 && message) {
                this.messages[index] = message;
                if (this.currentView === 'chat') {
                    $('#chat-messages').html(this.renderMessages());
                }
            }
        },

        markMessageFailed: function(tempId) {
            var msg = this.messages.find(function(m) { return m._id === tempId; });
            if (msg) {
                msg.status = 'failed';
                if (this.currentView === 'chat') {
                    $('#chat-messages').html(this.renderMessages());
                }
            }
        },

        scrollToBottom: function() {
            var $messages = $('#chat-messages');
            if ($messages.length) {
                $messages.scrollTop($messages[0].scrollHeight);
            }
        },

        autoResizeTextarea: function(element) {
            $(element).css('height', 'auto');
            $(element).css('height', Math.min(element.scrollHeight, 120) + 'px');
        },

        saveGuestSession: function() {
            try {
                localStorage.setItem('worknoon_chat_session', JSON.stringify({
                    backendUserId: this.backendUserId,
                    jwtToken: this.jwtToken,
                    refreshToken: this.refreshToken,
                    userName: this.userName,
                    userEmail: this.userEmail,
                    isGuest: true
                }));
            } catch (e) {
                console.error('Error saving session:', e);
            }
        },

        restoreGuestSession: function() {
            try {
                var stored = localStorage.getItem('worknoon_chat_session');
                if (stored) {
                    var session = JSON.parse(stored);
                    if (session && session.backendUserId && session.jwtToken) {
                        this.backendUserId = session.backendUserId;
                        this.jwtToken = session.jwtToken;
                        this.refreshToken = session.refreshToken || '';
                        this.userName = session.userName || '';
                        this.userEmail = session.userEmail || '';
                        this.isGuest = true;
                        console.log('Restored guest session');
                    }
                }
            } catch (e) {
                console.error('Error restoring session:', e);
            }
        },

        formatTime: function(timestamp) {
            if (!timestamp) return '';
            var date = new Date(timestamp);
            var now = new Date();
            var diff = now - date;
            var minutes = Math.floor(diff / 60000);
            var hours = Math.floor(diff / 3600000);
            var days = Math.floor(diff / 86400000);

            if (minutes < 1) return 'Just now';
            if (minutes < 60) return minutes + 'm';
            if (hours < 24) return hours + 'h';
            if (days < 7) return days + 'd';
            return date.toLocaleDateString();
        },

        escapeHtml: function(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        isValidEmail: function(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        WorknoonChat.init();
    });

    window.WorknoonChat = WorknoonChat;

})(jQuery);
