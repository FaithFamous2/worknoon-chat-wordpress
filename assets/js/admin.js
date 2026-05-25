/**
 * Worknoon Chat Admin JavaScript
 * Full admin dashboard functionality
 */
(function($) {
    'use strict';

    var WorknoonChatAdmin = {
        // State
        conversations: [],
        currentConversation: null,
        messages: [],
        socket: null,
        socketConnected: false,
        pollingInterval: null,
        backendUserId: null,
        jwtToken: null,

        init: function() {
            console.log('WorknoonChatAdmin initializing...', worknoonChatAdmin);

            this.backendUserId = $('#worknoon-current-user-id').val();
            this.jwtToken = this.getJwtToken();

            this.bindEvents();
            this.initApiTest();
            this.initDashboard();
            this.initConversationsPage();
            this.initSocket();
        },

        getJwtToken: function() {
            // Try to get from localized data or cookie
            return worknoonChatAdmin.jwtToken || '';
        },

        bindEvents: function() {
            var self = this;

            // Refresh messages button
            $(document).on('click', '#refresh-chat-messages', function() {
                self.loadMessages();
            });

            // Send message from admin
            $(document).on('click', '#send-admin-message', function() {
                self.sendAdminMessage();
            });

            // Enter key to send
            $(document).on('keypress', '#admin-message-input', function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    self.sendAdminMessage();
                }
            });

            // Dashboard refresh status
            $(document).on('click', '#worknoon-refresh-status', function() {
                self.checkSystemStatus();
            });

            // Refresh conversations
            $(document).on('click', '#worknoon-refresh-conversations', function() {
                self.loadAllConversations();
            });

            // Filter conversations
            $(document).on('change', '#worknoon-filter-status, #worknoon-filter-type', function() {
                self.filterConversations();
            });

            // Search conversations
            $(document).on('input', '#worknoon-search-conversations', function() {
                self.filterConversations();
            });

            // Conversation item click
            $(document).on('click', '.worknoon-conversation-item', function() {
                var conversationId = $(this).data('conversation-id');
                self.openConversation(conversationId);
            });

            // Admin send message
            $(document).on('click', '#worknoon-admin-send-btn', function() {
                self.sendMessageFromAdmin();
            });

            // Admin enter key send
            $(document).on('keypress', '#worknoon-admin-message-input', function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessageFromAdmin();
                }
            });

            // Sync users button
            $(document).on('click', '#worknoon-sync-users', function() {
                self.syncWordPressUsers();
            });

            // Filter users
            $(document).on('change', '#worknoon-filter-user-role', function() {
                self.filterUsers();
            });

            // Search users
            $(document).on('input', '#worknoon-search-users', function() {
                self.filterUsers();
            });
        },

        // ==================== SOCKET ====================

        initSocket: function() {
            var self = this;

            if (typeof io === 'undefined' || !this.jwtToken) {
                console.log('Socket.IO not available or no token');
                this.startPolling();
                return;
            }

            this.socket = io(worknoonChatAdmin.socketUrl || 'http://localhost:5001', {
                transports: ['websocket', 'polling'],
                auth: { token: this.jwtToken }
            });

            this.socket.on('connect', function() {
                console.log('Admin socket connected');
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

            this.socket.on('message_received', function(data) {
                var message = data.message || data;
                if (self.currentConversation && message.conversationId === self.currentConversation._id) {
                    var exists = self.messages.some(function(m) { return m._id === message._id; });
                    if (!exists) {
                        self.messages.push(message);
                        self.renderAdminMessages();
                    }
                } else {
                    // New message in other conversation - refresh list
                    self.loadAllConversations();
                }
            });
        },

        startPolling: function() {
            var self = this;
            // Only poll for new messages when viewing a conversation, not the conversation list
            this.pollingInterval = setInterval(function() {
                // Only poll messages when actively viewing a conversation
                if (self.currentConversation && $('#worknoon-admin-chat-messages').length &&
                    $('#worknoon-admin-chat-panel').is(':visible')) {
                    self.loadNewMessagesOnly(self.currentConversation._id);
                }
            }, 10000); // Poll every 10 seconds instead of 5
        },

        loadNewMessagesOnly: function(conversationId) {
            var self = this;

            // Build request data
            var requestData = {
                action: 'worknoon_chat_proxy',
                nonce: worknoonChatAdmin.nonce,
                endpoint: '/messages/conversations/' + conversationId,
                method: 'GET',
                data: JSON.stringify({})
            };

            // If no JWT token but we have master token, use external endpoint
            if (!this.jwtToken && worknoonChatAdmin.masterToken) {
                requestData.endpoint = '/external/conversations/' + conversationId + '/messages';
            }

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: requestData,
                success: function(response) {
                    if (response.success && response.data) {
                        var messagesData = response.data;
                        // Handle paginated response from external API
                        if (response.data.data && Array.isArray(response.data.data.messages)) {
                            messagesData = response.data.data.messages;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            messagesData = response.data.data;
                        }

                        var newMessages = Array.isArray(messagesData) ? messagesData : (messagesData.messages || []);

                        // Only update if there are new messages
                        if (newMessages.length > self.messages.length) {
                            self.messages = newMessages;
                            self.renderAdminMessages();
                        }
                    }
                }
            });
        },

        stopPolling: function() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
        },

        // ==================== DASHBOARD ====================

        initDashboard: function() {
            if (!$('.worknoon-admin-dashboard').length) return;

            this.checkSystemStatus();
            this.loadRecentConversations();
        },

        checkSystemStatus: function() {
            var self = this;

            // Check API status
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'worknoon_test_connection',
                    nonce: worknoonChatAdmin.nonce
                },
                success: function(response) {
                    var $apiStatus = $('#worknoon-api-status');
                    if (response.success) {
                        $apiStatus.removeClass('worknoon-status-checking worknoon-status-error')
                                  .addClass('worknoon-status-ok')
                                  .text('Connected');
                    } else {
                        $apiStatus.removeClass('worknoon-status-checking worknoon-status-ok')
                                  .addClass('worknoon-status-error')
                                  .text('Error');
                    }
                },
                error: function() {
                    $('#worknoon-api-status').removeClass('worknoon-status-checking worknoon-status-ok')
                                            .addClass('worknoon-status-error')
                                            .text('Offline');
                }
            });

            // Check Master Token status
            if (worknoonChatAdmin.masterToken) {
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_test_master_token',
                        nonce: worknoonChatAdmin.nonce
                    },
                    success: function(response) {
                        var $tokenStatus = $('#worknoon-master-token-status');
                        if (response.success) {
                            $tokenStatus.removeClass('worknoon-status-checking worknoon-status-error')
                                      .addClass('worknoon-status-ok')
                                      .text('Valid');
                        } else {
                            $tokenStatus.removeClass('worknoon-status-checking worknoon-status-ok')
                                      .addClass('worknoon-status-error')
                                      .text('Invalid');
                        }
                    },
                    error: function() {
                        $('#worknoon-master-token-status').removeClass('worknoon-status-checking worknoon-status-ok')
                                                        .addClass('worknoon-status-error')
                                                        .text('Error');
                    }
                });
            } else {
                $('#worknoon-master-token-status').removeClass('worknoon-status-checking worknoon-status-ok')
                                                .addClass('worknoon-status-error')
                                                .text('Not Configured');
            }

            // Check WebSocket status
            var $socketStatus = $('#worknoon-socket-status');
            if (this.socketConnected) {
                $socketStatus.removeClass('worknoon-status-checking worknoon-status-error')
                             .addClass('worknoon-status-ok')
                             .text('Connected');
            } else {
                $socketStatus.removeClass('worknoon-status-checking worknoon-status-ok')
                             .addClass('worknoon-status-error')
                             .text('Disconnected');
            }
        },

        loadRecentConversations: function() {
            var self = this;

            // Build request data - include master token if no JWT token available
            var requestData = {
                action: 'worknoon_chat_proxy',
                nonce: worknoonChatAdmin.nonce,
                endpoint: '/conversations',
                method: 'GET',
                data: JSON.stringify({})
            };

            // If no JWT token but we have master token, use external endpoint
            if (!this.jwtToken && worknoonChatAdmin.masterToken) {
                console.log('[Admin] No JWT token, using master token fallback for recent conversations');
                requestData.endpoint = '/external/conversations';
            }

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: requestData,
                success: function(response) {
                    console.log('[Admin] Recent conversations response:', response);
                    if (response.success && response.data) {
                        // Handle paginated response from external API
                        var conversationsData = response.data;
                        if (response.data.data && Array.isArray(response.data.data)) {
                            conversationsData = response.data.data;
                        }
                        self.conversations = Array.isArray(conversationsData) ? conversationsData : (conversationsData.conversations || []);
                        self.renderRecentConversations();
                    }
                }
            });
        },

        renderRecentConversations: function() {
            var $container = $('#worknoon-recent-conversations');
            if (!$container.length) return;

            if (this.conversations.length === 0) {
                $container.html('<p class="worknoon-no-data">No conversations yet.</p>');
                return;
            }

            var html = '';
            var recent = this.conversations.slice(0, 5); // Show 5 most recent

            $.each(recent, function(index, conv) {
                var otherParticipant = self.getOtherParticipant(conv);
                var lastMessage = conv.lastMessage || {};
                var isUnread = conv.unreadCount > 0;
                var time = self.formatTime(lastMessage.createdAt || conv.updatedAt);

                html += '<div class="worknoon-recent-conversation ' + (isUnread ? 'unread' : '') + '" data-conversation-id="' + conv._id + '">' +
                    '<div class="worknoon-recent-conv-info">' +
                        '<strong>' + self.escapeHtml(otherParticipant.name || 'Unknown') + '</strong>' +
                        '<span class="worknoon-recent-time">' + time + '</span>' +
                    '</div>' +
                    '<div class="worknoon-recent-preview">' + self.escapeHtml(lastMessage.content || 'No messages') + '</div>' +
                    (isUnread ? '<span class="worknoon-unread-badge">' + conv.unreadCount + '</span>' : '') +
                '</div>';
            });

            $container.html(html);
        },

        // ==================== CONVERSATIONS PAGE ====================

        initConversationsPage: function() {
            if (!$('.worknoon-admin-conversations').length) return;

            this.loadAllConversations();
        },

        loadAllConversations: function() {
            var self = this;

            $('#worknoon-all-conversations').html('<p class="worknoon-loading">Loading conversations...</p>');

            // Build request data - include master token if no JWT token available
            var requestData = {
                action: 'worknoon_chat_proxy',
                nonce: worknoonChatAdmin.nonce,
                endpoint: '/conversations',
                method: 'GET',
                data: JSON.stringify({})
            };

            // If no JWT token but we have master token, the PHP will use master token fallback
            // But we need to tell PHP to use external endpoint
            if (!this.jwtToken && worknoonChatAdmin.masterToken) {
                console.log('[Admin] No JWT token, using master token fallback for conversations');
                requestData.endpoint = '/external/conversations';
            }

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: requestData,
                success: function(response) {
                    console.log('[Admin] All conversations response:', response);
                    if (response.success && response.data) {
                        // Backend returns data directly (array) or in data property
                        var conversationsData = response.data;
                        // Handle paginated response from external API
                        if (response.data.data && Array.isArray(response.data.data)) {
                            conversationsData = response.data.data;
                        }
                        self.conversations = Array.isArray(conversationsData) ? conversationsData : (conversationsData.conversations || []);
                        self.renderConversationsList();
                    } else {
                        $('#worknoon-all-conversations').html('<p class="worknoon-error">Failed to load conversations: ' + (response.data || 'Unknown error') + '</p>');
                    }
                },
                error: function(xhr, status, error) {
                    console.error('[Admin] Error loading conversations:', error);
                    $('#worknoon-all-conversations').html('<p class="worknoon-error">Error loading conversations: ' + error + '</p>');
                }
            });
        },

        renderConversationsList: function() {
            var $container = $('#worknoon-all-conversations');
            if (!$container.length) return;

            if (this.conversations.length === 0) {
                $container.html('<p class="worknoon-no-data">No conversations found.</p>');
                return;
            }

            var html = '';
            var self = this;

            $.each(this.conversations, function(index, conv) {
                var otherParticipant = self.getOtherParticipant(conv);
                var lastMessage = conv.lastMessage || {};
                var isUnread = conv.unreadCount > 0;
                var time = self.formatTime(lastMessage.createdAt || conv.updatedAt);
                var typeLabel = self.getConversationTypeLabel(conv.type);

                html += '<div class="worknoon-conversation-item ' + (isUnread ? 'unread' : '') + '" data-conversation-id="' + conv._id + '">' +
                    '<div class="worknoon-conv-avatar">' +
                        '<span>' + (otherParticipant.name ? otherParticipant.name.charAt(0).toUpperCase() : '?') + '</span>' +
                    '</div>' +
                    '<div class="worknoon-conv-info">' +
                        '<div class="worknoon-conv-header">' +
                            '<strong>' + self.escapeHtml(otherParticipant.name || 'Unknown') + '</strong>' +
                            '<span class="worknoon-conv-type">' + typeLabel + '</span>' +
                        '</div>' +
                        '<div class="worknoon-conv-preview">' + self.escapeHtml(lastMessage.content || 'No messages') + '</div>' +
                        '<div class="worknoon-conv-meta">' +
                            '<span class="worknoon-conv-time">' + time + '</span>' +
                            (isUnread ? '<span class="worknoon-unread-count">' + conv.unreadCount + ' new</span>' : '') +
                        '</div>' +
                    '</div>' +
                '</div>';
            });

            $container.html(html);
        },

        filterConversations: function() {
            var statusFilter = $('#worknoon-filter-status').val();
            var typeFilter = $('#worknoon-filter-type').val();
            var searchQuery = $('#worknoon-search-conversations').val().toLowerCase();

            var filtered = this.conversations.filter(function(conv) {
                var matchesStatus = !statusFilter || conv.status === statusFilter;
                var matchesType = !typeFilter || conv.type === typeFilter;
                var matchesSearch = !searchQuery;

                if (searchQuery) {
                    var otherParticipant = WorknoonChatAdmin.getOtherParticipant(conv);
                    var searchText = (otherParticipant.name + ' ' + (conv.lastMessage?.content || '')).toLowerCase();
                    matchesSearch = searchText.includes(searchQuery);
                }

                return matchesStatus && matchesType && matchesSearch;
            });

            this.renderFilteredConversations(filtered);
        },

        renderFilteredConversations: function(conversations) {
            var $container = $('#worknoon-all-conversations');
            if (conversations.length === 0) {
                $container.html('<p class="worknoon-no-data">No conversations match your filters.</p>');
                return;
            }

            var html = '';
            var self = this;

            $.each(conversations, function(index, conv) {
                var otherParticipant = self.getOtherParticipant(conv);
                var lastMessage = conv.lastMessage || {};
                var isUnread = conv.unreadCount > 0;
                var time = self.formatTime(lastMessage.createdAt || conv.updatedAt);
                var typeLabel = self.getConversationTypeLabel(conv.type);

                html += '<div class="worknoon-conversation-item ' + (isUnread ? 'unread' : '') + '" data-conversation-id="' + conv._id + '">' +
                    '<div class="worknoon-conv-avatar">' +
                        '<span>' + (otherParticipant.name ? otherParticipant.name.charAt(0).toUpperCase() : '?') + '</span>' +
                    '</div>' +
                    '<div class="worknoon-conv-info">' +
                        '<div class="worknoon-conv-header">' +
                            '<strong>' + self.escapeHtml(otherParticipant.name || 'Unknown') + '</strong>' +
                            '<span class="worknoon-conv-type">' + typeLabel + '</span>' +
                        '</div>' +
                        '<div class="worknoon-conv-preview">' + self.escapeHtml(lastMessage.content || 'No messages') + '</div>' +
                        '<div class="worknoon-conv-meta">' +
                            '<span class="worknoon-conv-time">' + time + '</span>' +
                            (isUnread ? '<span class="worknoon-unread-count">' + conv.unreadCount + ' new</span>' : '') +
                        '</div>' +
                    '</div>' +
                '</div>';
            });

            $container.html(html);
        },

        openConversation: function(conversationId) {
            var conversation = this.conversations.find(function(c) { return c._id === conversationId; });
            if (!conversation) return;

            this.currentConversation = conversation;

            // Show chat panel
            $('#worknoon-admin-chat-panel').show();

            // Update header
            var otherParticipant = this.getOtherParticipant(conversation);
            $('#worknoon-chat-participant-name').text(otherParticipant.name || 'Unknown');
            $('#worknoon-chat-status').text(conversation.status || 'active').attr('class', 'worknoon-status-badge worknoon-status-' + (conversation.status || 'active'));

            // Load messages
            this.loadMessagesForConversation(conversationId);

            // Join socket room
            if (this.socketConnected && this.socket) {
                this.socket.emit('join_conversation', conversationId);
            }
        },

        loadMessagesForConversation: function(conversationId) {
            var self = this;

            $('#worknoon-admin-chat-messages').html('<p class="worknoon-loading">Loading messages...</p>');

            // Build request data - include master token if no JWT token available
            var requestData = {
                action: 'worknoon_chat_proxy',
                nonce: worknoonChatAdmin.nonce,
                endpoint: '/messages/conversations/' + conversationId,
                method: 'GET',
                data: JSON.stringify({})
            };

            // If no JWT token but we have master token, use external endpoint
            if (!this.jwtToken && worknoonChatAdmin.masterToken) {
                console.log('[Admin] No JWT token, using master token fallback for messages');
                requestData.endpoint = '/external/conversations/' + conversationId + '/messages';
            }

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: requestData,
                success: function(response) {
                    console.log('[Admin] Messages response:', response);
                    if (response.success && response.data) {
                        // Backend returns messages directly (array) or in messages property
                        var messagesData = response.data;
                        // Handle paginated response from external API
                        if (response.data.data && Array.isArray(response.data.data.messages)) {
                            messagesData = response.data.data.messages;
                        } else if (response.data.data && Array.isArray(response.data.data)) {
                            messagesData = response.data.data;
                        }
                        self.messages = Array.isArray(messagesData) ? messagesData : (messagesData.messages || []);
                        self.renderAdminMessages();
                    }
                },
                error: function() {
                    $('#worknoon-admin-chat-messages').html('<p class="worknoon-error">Error loading messages.</p>');
                }
            });
        },

        renderAdminMessages: function() {
            var $container = $('#worknoon-admin-chat-messages');
            if (!$container.length) return;

            if (this.messages.length === 0) {
                $container.html('<p class="worknoon-no-messages">No messages yet. Start the conversation!</p>');
                return;
            }

            var html = '';
            var self = this;
            var currentUserId = this.backendUserId;

            $.each(this.messages, function(index, message) {
                var sender = message.sender || message.senderId;
                var senderId = sender ? (sender._id || sender.id || sender) : null;
                var isOwn = senderId === currentUserId;
                var messageClass = isOwn ? 'worknoon-admin-message own' : 'worknoon-admin-message';
                var time = self.formatTime(message.createdAt);

                // Handle attachments
                var attachmentHtml = '';
                if (message.attachments && message.attachments.length > 0) {
                    $.each(message.attachments, function(i, att) {
                        var url = att.url || att;
                        var name = att.name || 'File';
                        var type = att.type || 'file';

                        if (type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
                            attachmentHtml += '<div class="worknoon-attachment-image">' +
                                '<img src="' + url + '" alt="' + name + '" style="max-width: 200px; max-height: 150px; border-radius: 4px;">' +
                            '</div>';
                        } else {
                            attachmentHtml += '<div class="worknoon-attachment-file">' +
                                '<a href="' + url + '" target="_blank">📎 ' + name + '</a>' +
                            '</div>';
                        }
                    });
                }

                html += '<div class="' + messageClass + '">' +
                    '<div class="worknoon-message-header">' +
                        '<span>' + self.escapeHtml(sender && sender.name ? sender.name : 'Unknown') + '</span>' +
                        '<span>' + time + '</span>' +
                    '</div>' +
                    '<div class="worknoon-message-content">' +
                        self.escapeHtml(message.content) +
                        attachmentHtml +
                    '</div>' +
                '</div>';
            });

            $container.html(html);
            $container.scrollTop($container[0].scrollHeight);
        },

        sendMessageFromAdmin: function() {
            var $input = $('#worknoon-admin-message-input');
            var content = $input.val().trim();
            var conversationId = this.currentConversation ? this.currentConversation._id : null;

            if (!content || !conversationId) return;

            $input.prop('disabled', true);

            var self = this;

            // Send via socket if connected
            if (this.socketConnected && this.socket) {
                this.socket.emit('send_message', {
                    conversationId: conversationId,
                    content: content
                });

                $input.val('').prop('disabled', false).focus();
                this.loadMessagesForConversation(conversationId);
            } else {
                // Send via REST
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_chat_proxy',
                        nonce: worknoonChatAdmin.nonce,
                        endpoint: '/messages',
                        method: 'POST',
                        data: JSON.stringify({
                            conversationId: conversationId,
                            content: content
                        })
                    },
                    success: function(response) {
                        if (response.success) {
                            $input.val('');
                            self.loadMessagesForConversation(conversationId);
                        } else {
                            alert('Failed to send message.');
                        }
                    },
                    error: function() {
                        alert('Failed to send message.');
                    },
                    complete: function() {
                        $input.prop('disabled', false).focus();
                    }
                });
            }
        },

        // ==================== USERS PAGE ====================

        syncWordPressUsers: function() {
            var $button = $('#worknoon-sync-users');
            $button.prop('disabled', true).text('Syncing...');

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'worknoon_sync_users',
                    nonce: worknoonChatAdmin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        alert('Users synced successfully!');
                        location.reload();
                    } else {
                        alert('Sync failed: ' + (response.data || 'Unknown error'));
                    }
                },
                error: function() {
                    alert('Sync failed. Please try again.');
                },
                complete: function() {
                    $button.prop('disabled', false).text('Sync WordPress Users');
                }
            });
        },

        filterUsers: function() {
            var roleFilter = $('#worknoon-filter-user-role').val();
            var searchQuery = $('#worknoon-search-users').val().toLowerCase();

            $('#worknoon-users-list tr').each(function() {
                var $row = $(this);
                var role = $row.find('.worknoon-role-badge').text().toLowerCase();
                var name = $row.find('strong').text().toLowerCase();
                var email = $row.find('small').text().toLowerCase();

                var matchesRole = !roleFilter || role === roleFilter;
                var matchesSearch = !searchQuery || name.includes(searchQuery) || email.includes(searchQuery);

                $row.toggle(matchesRole && matchesSearch);
            });
        },

        // ==================== HELPERS ====================

        getOtherParticipant: function(conversation) {
            if (!conversation.participants) return { name: 'Unknown' };

            var self = this;
            var other = conversation.participants.find(function(p) {
                var participantId = (typeof p.userId === 'object' && p.userId !== null) ? p.userId._id : p.userId;
                return participantId && participantId !== self.backendUserId;
            });

            if (other && other.userId) {
                var user = other.userId;
                if (typeof user === 'object' && user !== null) {
                    var name = (user.profile && (user.profile.firstName || user.profile.lastName))
                        ? (user.profile.firstName || '') + ' ' + (user.profile.lastName || '')
                        : user.email || user.name || 'Unknown';
                    return {
                        name: name.trim(),
                        isOnline: user.status && user.status.isOnline
                    };
                }
            }
            return { name: 'Unknown' };
        },

        getConversationTypeLabel: function(type) {
            var labels = {
                'buyer-agent': 'Support',
                'buyer-designer': 'Designer',
                'buyer-merchant': 'Merchant',
                'agent-designer': 'Internal',
                'agent-merchant': 'Internal'
            };
            return labels[type] || 'Chat';
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
            if (minutes < 60) return minutes + 'm ago';
            if (hours < 24) return hours + 'h ago';
            if (days < 7) return days + 'd ago';
            return date.toLocaleDateString();
        },

        escapeHtml: function(text) {
            if (!text) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        // ==================== API TEST METHODS ====================

        initApiTest: function() {
            var self = this;

            console.log('WorknoonChatAdmin: initApiTest called');

            // Test basic backend connection
            $(document).on('click', '#test-api-connection', function(e) {
                e.preventDefault();
                var $button = $(this);
                var $result = $('#api-test-result');

                console.log('Test API Connection clicked');

                $button.prop('disabled', true).text('Testing...');
                $result.html('<span class="worknoon-spinner"></span>');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_test_connection',
                        nonce: worknoonChatAdmin.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            $result.html('<span style="color: green;">✓ Connected successfully!</span>');
                        } else {
                            $result.html('<span style="color: red;">✗ Connection failed: ' + (response.data || 'Unknown error') + '</span>');
                        }
                    },
                    error: function(xhr, status, error) {
                        $result.html('<span style="color: red;">✗ Connection error: ' + error + '</span>');
                    },
                    complete: function() {
                        $button.prop('disabled', false).text('Test Backend Connection');
                    }
                });
            });

            // Test master token authentication
            $(document).on('click', '#test-master-token', function(e) {
                e.preventDefault();
                var $button = $(this);
                var $result = $('#master-token-result');

                console.log('Test Master Token clicked');

                $button.prop('disabled', true).text('Testing...');
                $result.html('<span class="worknoon-spinner"></span>');

                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'worknoon_test_master_token',
                        nonce: worknoonChatAdmin.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            $result.html('<span style="color: green;">✓ ' + response.data + '</span>');
                        } else {
                            $result.html('<span style="color: red;">✗ ' + (response.data || 'Master token test failed') + '</span>');
                        }
                    },
                    error: function(xhr, status, error) {
                        $result.html('<span style="color: red;">✗ Test error: ' + error + '</span>');
                    },
                    complete: function() {
                        $button.prop('disabled', false).text('Test Master Token Auth');
                    }
                });
            });
        },

        loadMessages: function() {
            var conversationId = $('#worknoon-conversation-id').val();
            if (!conversationId) return;

            var $container = $('#worknoon-chat-messages-container');
            $container.html('<div class="worknoon-spinner"></div>');

            var self = this;

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChatAdmin.nonce,
                    endpoint: '/conversations/' + conversationId,
                    method: 'GET',
                    data: JSON.stringify({})
                },
                success: function(response) {
                    if (response.success && response.data.data && response.data.data.conversation) {
                        self.renderMessages(response.data.data.conversation.messages || []);
                    } else {
                        $container.html('<p>Error loading messages.</p>');
                    }
                },
                error: function() {
                    $container.html('<p>Error loading messages.</p>');
                }
            });
        },

        renderMessages: function(messages) {
            var $container = $('#worknoon-chat-messages-container');
            $container.empty();

            if (messages.length === 0) {
                $container.html('<p>No messages yet.</p>');
                return;
            }

            var currentUserId = $('#worknoon-current-user-id').val();
            var self = this;

            $.each(messages, function(index, message) {
                var isOwn = message.sender && message.sender._id === currentUserId;
                var messageClass = isOwn ? 'worknoon-chat-message own' : 'worknoon-chat-message';

                var html = '<div class="' + messageClass + '">' +
                    '<div class="worknoon-chat-message-header">' +
                        '<span>' + self.escapeHtml(message.sender ? message.sender.name : 'Unknown') + '</span>' +
                        '<span>' + self.formatTime(message.createdAt) + '</span>' +
                    '</div>' +
                    '<div class="worknoon-chat-message-content">' +
                        self.escapeHtml(message.content) +
                    '</div>' +
                '</div>';

                $container.append(html);
            });

            $container.scrollTop($container[0].scrollHeight);
        },

        sendAdminMessage: function() {
            var $input = $('#admin-message-input');
            var content = $input.val().trim();
            var conversationId = $('#worknoon-conversation-id').val();

            if (!content || !conversationId) return;

            $input.prop('disabled', true);

            var self = this;

            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_proxy',
                    nonce: worknoonChatAdmin.nonce,
                    endpoint: '/messages',
                    method: 'POST',
                    data: JSON.stringify({
                        conversationId: conversationId,
                        content: content
                    })
                },
                success: function(response) {
                    if (response.success) {
                        $input.val('');
                        self.loadMessages();
                    } else {
                        alert('Failed to send message. Please try again.');
                    }
                },
                error: function() {
                    alert('Failed to send message. Please try again.');
                },
                complete: function() {
                    $input.prop('disabled', false).focus();
                }
            });
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        WorknoonChatAdmin.init();
    });

    // Expose to global scope
    window.WorknoonChatAdmin = WorknoonChatAdmin;

})(jQuery);
