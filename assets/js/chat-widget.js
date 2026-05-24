/**
 * Worknoon Chat Widget JavaScript
 */
(function($) {
    'use strict';

    var WorknoonChat = {
        sessionId: null,
        userId: worknoonChat.userId || null,
        userName: worknoonChat.userName || 'Guest',
        isLoggedIn: worknoonChat.isLoggedIn || false,
        settings: worknoonChat.settings || {},
        messages: [],
        pollingInterval: null,
        isWidgetOpen: false,

        init: function() {
            this.cacheElements();
            this.bindEvents();
            this.applySettings();

            // Check if there's a session ID in the URL or data attribute
            var urlSessionId = this.getUrlParameter('chat_session');
            var widgetSessionId = $('#worknoon-chat-widget').data('session-id');

            if (urlSessionId || widgetSessionId) {
                this.sessionId = urlSessionId || widgetSessionId;
                this.loadMessages();
                this.startPolling();
            }
        },

        cacheElements: function() {
            this.$widget = $('#worknoon-chat-widget');
            this.$container = this.$widget.find('.chat-widget-container');
            this.$messages = this.$widget.find('#chat-messages');
            this.$input = this.$widget.find('#chat-message-input');
            this.$sendBtn = this.$widget.find('#chat-send-btn');
            this.$fab = this.$widget.find('.chat-fab');
            this.$toggle = this.$widget.find('.chat-toggle');
        },

        bindEvents: function() {
            var self = this;

            // Toggle widget
            this.$fab.on('click', function() {
                self.toggleWidget();
            });

            this.$toggle.on('click', function() {
                self.toggleWidget();
            });

            // Send message
            this.$sendBtn.on('click', function() {
                self.sendMessage();
            });

            // Send on Enter key
            this.$input.on('keypress', function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessage();
                }
            });

            // Chat button shortcode
            $('.worknoon-chat-btn').on('click', function() {
                var agentId = $(this).data('agent-id');
                self.startNewChat(agentId);
            });
        },

        applySettings: function() {
            // Apply primary color
            if (this.settings.primary_color) {
                document.documentElement.style.setProperty('--chat-primary-color', this.settings.primary_color);
            }

            // Apply position
            if (this.settings.position) {
                this.$widget.addClass(this.settings.position);
            }
        },

        toggleWidget: function() {
            this.isWidgetOpen = !this.isWidgetOpen;
            this.$widget.toggleClass('open', this.isWidgetOpen);

            if (this.isWidgetOpen && this.sessionId) {
                this.loadMessages();
                this.scrollToBottom();
            }
        },

        startNewChat: function(agentId) {
            var self = this;

            if (!this.isLoggedIn && !this.settings.allow_guest_chat) {
                alert('Please log in to start a chat.');
                return;
            }

            // Create new session via REST API
            $.ajax({
                url: worknoonChat.restUrl + 'sessions',
                method: 'POST',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', worknoonChat.nonce);
                },
                data: {
                    title: 'Support Chat',
                    type: 'support',
                    agent_id: agentId || 0
                },
                success: function(response) {
                    self.sessionId = response.id;
                    self.openWidget();
                    self.addSystemMessage('Chat started. An agent will be with you shortly.');
                },
                error: function(xhr) {
                    console.error('Failed to start chat:', xhr);
                    alert('Failed to start chat. Please try again.');
                }
            });
        },

        sendMessage: function() {
            var content = this.$input.val().trim();

            if (!content || !this.sessionId) {
                return;
            }

            var self = this;
            var message = {
                id: 'temp-' + Date.now(),
                sender_id: this.userId,
                sender_name: this.userName,
                content: content,
                timestamp: new Date().toISOString(),
                isOwn: true
            };

            // Optimistically add message
            this.addMessageToUI(message);
            this.$input.val('');
            this.scrollToBottom();

            // Send via AJAX
            $.ajax({
                url: worknoonChat.restUrl + 'sessions/' + this.sessionId + '/messages',
                method: 'POST',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', worknoonChat.nonce);
                },
                data: {
                    content: content
                },
                success: function(response) {
                    // Replace temp message with confirmed message
                    self.replaceTempMessage(message.id, response);
                },
                error: function(xhr) {
                    console.error('Failed to send message:', xhr);
                    self.markMessageFailed(message.id);
                }
            });
        },

        loadMessages: function() {
            if (!this.sessionId) {
                return;
            }

            var self = this;

            $.ajax({
                url: worknoonChat.restUrl + 'sessions/' + this.sessionId + '/messages',
                method: 'GET',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('X-WP-Nonce', worknoonChat.nonce);
                },
                success: function(response) {
                    self.messages = response;
                    self.renderMessages();
                },
                error: function(xhr) {
                    console.error('Failed to load messages:', xhr);
                }
            });
        },

        startPolling: function() {
            var self = this;

            // Poll for new messages every 3 seconds
            this.pollingInterval = setInterval(function() {
                if (self.isWidgetOpen && self.sessionId) {
                    self.loadMessages();
                }
            }, 3000);
        },

        stopPolling: function() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
        },

        renderMessages: function() {
            var self = this;
            var currentScroll = this.$messages.scrollTop();
            var isAtBottom = currentScroll + this.$messages.height() >= this.$messages[0].scrollHeight - 50;

            this.$messages.empty();

            if (this.messages.length === 0) {
                this.$messages.html(
                    '<div class="chat-empty">' +
                    '<div class="chat-empty-icon">💬</div>' +
                    '<p>No messages yet. Start the conversation!</p>' +
                    '</div>'
                );
                return;
            }

            $.each(this.messages, function(index, message) {
                self.addMessageToUI(message, false);
            });

            // Scroll to bottom if user was already at bottom or this is first load
            if (isAtBottom || currentScroll === 0) {
                this.scrollToBottom();
            }
        },

        addMessageToUI: function(message, append) {
            append = append !== false;

            var isOwn = message.sender_id == this.userId;
            var messageClass = isOwn ? 'chat-message own' : 'chat-message';
            var time = this.formatTime(message.timestamp);

            var html =
                '<div class="' + messageClass + '" data-message-id="' + message.id + '">' +
                    '<div class="chat-message-bubble">' +
                        this.escapeHtml(message.content) +
                    '</div>' +
                    '<div class="chat-message-meta">' +
                        '<span class="sender">' + this.escapeHtml(message.sender_name) + '</span>' +
                        ' • ' +
                        '<span class="time">' + time + '</span>' +
                    '</div>' +
                '</div>';

            if (append) {
                this.$messages.append(html);
                this.scrollToBottom();
            } else {
                this.$messages.append(html);
            }
        },

        addSystemMessage: function(content) {
            var html =
                '<div class="chat-system-message">' +
                    '<span>' + this.escapeHtml(content) + '</span>' +
                '</div>';

            this.$messages.append(html);
            this.scrollToBottom();
        },

        replaceTempMessage: function(tempId, confirmedMessage) {
            var $tempMessage = this.$messages.find('[data-message-id="' + tempId + '"]');

            if ($tempMessage.length) {
                var isOwn = confirmedMessage.sender_id == this.userId;
                var messageClass = isOwn ? 'chat-message own' : 'chat-message';
                var time = this.formatTime(confirmedMessage.timestamp);

                $tempMessage.attr('data-message-id', confirmedMessage.id);
                $tempMessage.attr('class', messageClass);
            }
        },

        markMessageFailed: function(messageId) {
            var $message = this.$messages.find('[data-message-id="' + messageId + '"]');
            $message.addClass('failed');
            $message.find('.chat-message-bubble').append(' <span style="color: #ef4444;">(Failed)</span>');
        },

        scrollToBottom: function() {
            this.$messages.scrollTop(this.$messages[0].scrollHeight);
        },

        formatTime: function(timestamp) {
            var date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        escapeHtml: function(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        getUrlParameter: function(name) {
            var url = new URL(window.location.href);
            return url.searchParams.get(name);
        },

        openWidget: function() {
            this.isWidgetOpen = true;
            this.$widget.addClass('open');
            this.startPolling();
        },

        closeWidget: function() {
            this.isWidgetOpen = false;
            this.$widget.removeClass('open');
            this.stopPolling();
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        WorknoonChat.init();
    });

    // Expose to global scope
    window.WorknoonChat = WorknoonChat;

})(jQuery);
