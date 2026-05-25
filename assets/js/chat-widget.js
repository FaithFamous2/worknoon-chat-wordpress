/**
 * Worknoon Chat Widget - Full Inbox Experience
 * Mirrors the frontend inbox functionality
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
        currentView: 'conversations', // 'conversations', 'chat', 'new-chat', 'guest-form', 'login-prompt'

        // DOM elements cache
        elements: {},

        init: function() {
            console.log('WorknoonChat initializing...', worknoonChat);

            // Set initial values from WordPress
            this.userId = worknoonChat.userId || null;
            this.backendUserId = worknoonChat.backendUserId || null;
            this.userName = worknoonChat.userName || '';
            this.userEmail = worknoonChat.userEmail || '';
            this.isLoggedIn = worknoonChat.isLoggedIn || false;
            this.jwtToken = worknoonChat.jwtToken || '';

            this.cacheElements();
            this.bindEvents();
            this.applySettings();

            // Only restore guest session if user is NOT logged in
            if (!this.isLoggedIn) {
                this.restoreGuestSession();
            }

            // Initialize socket if we have a token
            if (this.jwtToken) {
                this.initSocket();
            }

            console.log('Widget initialized - Logged in:', this.isLoggedIn, 'Backend ID:', this.backendUserId, 'JWT:', this.jwtToken ? 'Yes' : 'No');
        },

        cacheElements: function() {
            this.elements.$widget = $('#worknoon-chat-widget');
            this.elements.$container = this.elements.$widget.find('.chat-widget-container');
            this.elements.$fab = this.elements.$widget.find('.chat-fab');
            this.elements.$badge = this.elements.$widget.find('#chat-notification-badge');
            this.elements.$header = this.elements.$widget.find('.chat-header');
            this.elements.$content = this.elements.$widget.find('.chat-content');
        },

        bindEvents: function() {
            var self = this;

            // Toggle widget
            this.elements.$fab.on('click', function() {
                self.toggleWidget();
            });

            // Header back button
            this.elements.$widget.on('click', '.chat-back-btn', function() {
                self.showConversationsList();
            });

            // New chat button
            this.elements.$widget.on('click', '.chat-new-btn', function() {
                self.showNewChatView();
            });

            // Close widget
            this.elements.$widget.on('click', '.chat-close-btn', function() {
                self.closeWidget();
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
            this.elements.$widget.on('click', '#guest-submit-btn', function() {
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

            // Login button
            this.elements.$widget.on('click', '#login-btn', function() {
                window.location.href = worknoonChat.loginUrl;
            });
        },

        applySettings: function() {
            if (worknoonChat.settings.primaryColor) {
                document.documentElement.style.setProperty('--chat-primary-color', worknoonChat.settings.primaryColor);
            }
            if (worknoonChat.settings.position) {
                this.elements.$widget.addClass(worknoonChat.settings.position);
            }
        },

        toggleWidget: function() {
            this.isWidgetOpen = !this.isWidgetOpen;
            this.elements.$widget.toggleClass('open', this.isWidgetOpen);

            if (this.isWidgetOpen) {
                this.onWidgetOpen();
            } else {
                this.onWidgetClose();
            }
        },

        closeWidget: function() {
            this.isWidgetOpen = false;
            this.elements.$widget.removeClass('open');
            this.onWidgetClose();
        },

        onWidgetOpen: function() {
            // Check authentication
            if (!this.backendUserId || !this.jwtToken) {
                if (this.isLoggedIn) {
                    // User is logged in but no backend sync yet
                    this.showLoading('Syncing your account...');
                    // Try to sync or show error
                    this.showLoginPrompt();
                } else if (worknoonChat.settings.allowGuestChat) {
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

        showLoginPrompt: function() {
            this.currentView = 'login-prompt';
            this.renderLoginPrompt();
        },

        showLoading: function(message) {
            this.elements.$content.html(
                '<div class="chat-loading">' +
                    '<div class="chat-spinner"></div>' +
                    '<p>' + (message || 'Loading...') + '</p>' +
                '</div>'
            );
        },

        // ==================== RENDERING ====================

        renderConversationsView: function() {
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
                        this.renderConversationsList() +
                    '</div>' +
                '</div>';

            this.elements.$content.html(html);
        },

        renderConversationsList: function() {
            if (this.isLoading) {
                return '<div class="chat-loading"><div class="chat-spinner"></div><p>Loading conversations...</p></div>';
            }

            if (this.conversations.length === 0) {
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
                            '<div class="chat-view-name">' + this.escapeHtml(otherParticipant.name || 'Unknown') + '</div>' +
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
                return '<div class="chat-loading"><div class="chat-spinner"></div><p>Loading users...</p></div>';
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

        renderLoginPrompt: function() {
            var html =
                '<div class="chat-login-view">' +
                    '<div class="chat-login-icon">💬</div>' +
                    '<h3>Start a Conversation</h3>' +
                    '<p>Connect with our team for support, design services, or merchant inquiries.</p>' +
                    (worknoonChat.settings.allowGuestChat
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

            $.each(this.messages, function(index, message) {
                var isOwn = message.sender && (message.sender._id === self.backendUserId);
                var messageClass = isOwn ? 'chat-message own' : 'chat-message';
                var time = self.formatTime(message.createdAt);

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

                html +=
                    '<div class="' + messageClass + '" data-message-id="' + message._id + '">' +
                        '<div class="chat-message-bubble">' +
                            self.escapeHtml(message.content) +
                            attachmentHtml +
                        '</div>' +
                        '<div class="chat-message-meta">' +
                            '<span>' + (isOwn ? 'You' : self.escapeHtml(message.sender ? message.sender.name : 'Unknown')) + '</span>' +
                            '<span>' + time + '</span>' +
                        '</div>' +
                    '</div>';
            });

            return html;
        },

        // ==================== DATA LOADING ====================

        loadConversations: function() {
            if (!this.jwtToken) return;

            this.isLoading = true;
            this.renderConversationsList();

            var self = this;

            $.ajax({
                url: worknoonChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChat.nonce,
                    endpoint: '/conversations',
                    method: 'GET',
                    data: JSON.stringify({}),
                    token: this.jwtToken
                },
                success: function(response) {
                    self.isLoading = false;
                    if (response.success && response.data && response.data.data) {
                        self.conversations = response.data.data.conversations || [];
                        self.updateUnreadCount();
                        if (self.currentView === 'conversations') {
                            self.renderConversationsList();
                        }
                    }
                },
                error: function() {
                    self.isLoading = false;
                    if (self.currentView === 'conversations') {
                        self.renderConversationsList();
                    }
                }
            });
        },

        loadAvailableUsers: function() {
            if (!this.jwtToken) return;

            this.isLoading = true;
            this.renderUsersList();

            var self = this;

            console.log('[Widget] Loading available users...');

            $.ajax({
                url: worknoonChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChat.nonce,
                    endpoint: '/users/available',
                    method: 'GET',
                    data: JSON.stringify({}),
                    token: this.jwtToken
                },
                success: function(response) {
                    self.isLoading = false;
                    console.log('[Widget] Users loaded:', response);
                    if (response.success && response.data && response.data.data) {
                        self.users = response.data.data.users || [];
                        console.log('[Widget] Users by role:', self.users.map(u => ({ id: u._id, role: u.role, email: u.email })));
                        if (self.currentView === 'new-chat') {
                            self.renderUsersList();
                        }
                    }
                },
                error: function(xhr, status, error) {
                    console.error('[Widget] Failed to load users:', error);
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
                url: worknoonChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChat.nonce,
                    endpoint: '/messages/conversations/' + this.currentConversation._id,
                    method: 'GET',
                    data: JSON.stringify({}),
                    token: this.jwtToken
                },
                success: function(response) {
                    if (response.success && response.data && response.data.data) {
                        self.messages = response.data.data.messages || [];
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
                url: worknoonChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChat.nonce,
                    endpoint: '/conversations',
                    method: 'POST',
                    data: JSON.stringify({
                        participantIds: [{ userId: userId, role: role }],
                        type: type
                    }),
                    token: this.jwtToken
                },
                success: function(response) {
                    self.isLoading = false;
                    if (response.success && response.data && response.data.data && response.data.data.conversation) {
                        self.currentConversation = response.data.data.conversation;
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
                    url: worknoonChat.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_chat_proxy',
                        nonce: worknoonChat.nonce,
                        endpoint: '/messages',
                        method: 'POST',
                        data: JSON.stringify({
                            conversationId: self.currentConversation._id,
                            content: content
                        }),
                        token: self.jwtToken
                    },
                    success: function(response) {
                        if (response.success && response.data && response.data.data) {
                            self.replaceTempMessage(tempId, response.data.data.message);
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
            formData.append('action', 'worknoon_chat_upload');
            formData.append('nonce', worknoonChat.nonce);
            formData.append('file', file);
            formData.append('token', this.jwtToken);

            // Upload file via WordPress AJAX
            $.ajax({
                url: worknoonChat.ajaxUrl,
                type: 'POST',
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
                    console.log('[Widget] Upload response:', response);
                    if (response.success && response.data && response.data.file) {
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
                        alert('Failed to upload file: ' + (response.data?.message || 'Unknown error'));
                    }
                },
                error: function(xhr, status, error) {
                    console.error('[Widget] Upload error:', error, xhr.responseText);
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
            $('#chat-messages').html(this.renderMessages());
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
                    url: worknoonChat.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_chat_proxy',
                        nonce: worknoonChat.nonce,
                        endpoint: '/messages',
                        method: 'POST',
                        data: JSON.stringify({
                            conversationId: self.currentConversation._id,
                            content: attachment.name,
                            attachments: [attachment]
                        }),
                        token: self.jwtToken
                    },
                    success: function(response) {
                        if (response.success && response.data && response.data.data) {
                            self.replaceTempMessage(tempId, response.data.data.message);
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

            var nameParts = name.split(' ');
            var firstName = nameParts[0] || 'Guest';
            var lastName = nameParts.slice(1).join(' ') || 'User';
            var password = 'Guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            var self = this;
            this.isLoading = true;

            $.ajax({
                url: worknoonChat.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy_nopriv',
                    nonce: worknoonChat.nonce,
                    endpoint: '/auth/register',
                    method: 'POST',
                    data: JSON.stringify({
                        firstName: firstName,
                        lastName: lastName,
                        email: email,
                        role: 'customer',
                        password: password
                    })
                },
                success: function(response) {
                    self.isLoading = false;
                    if (response.success && response.data && response.data.data) {
                        self.backendUserId = response.data.data.user._id;
                        self.jwtToken = response.data.data.tokens.accessToken;
                        self.refreshToken = response.data.data.tokens.refreshToken;
                        self.userName = name;
                        self.userEmail = email;
                        self.isGuest = true;

                        self.saveGuestSession();
                        self.initSocket();
                        self.loadConversations();
                        self.showConversationsList();
                    } else {
                        alert('Registration failed. Please try again.');
                    }
                },
                error: function() {
                    self.isLoading = false;
                    alert('Failed to create guest session. Please try again.');
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

            this.socket = io(worknoonChat.socketUrl, {
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

            // Listen for message_received (matches backend event name)
            this.socket.on('message_received', function(data) {
                console.log('Socket received message:', data);
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
                console.log('Socket received new_message (legacy):', data);
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
            var other = conversation.participants.find(function(p) {
                return p.userId && p.userId._id !== this.backendUserId;
            }.bind(this));
            if (other && other.userId) {
                var name = (other.userId.profile && (other.userId.profile.firstName || other.userId.profile.lastName))
                    ? (other.userId.profile.firstName || '') + ' ' + (other.userId.profile.lastName || '')
                    : other.userId.email || 'Unknown';
                return {
                    name: name,
                    isOnline: other.userId.status && other.userId.status.isOnline
                };
            }
            return { name: 'Unknown' };
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
