/**
 * Worknoon Chat Widget JavaScript
 * AJAX-based messaging for Storefront child theme
 */
(function($) {
    'use strict';

    var WorknoonChat = {
        sessionId: null,
        userId: worknoonChatData.userId || 0,
        userName: worknoonChatData.userName || 'Guest',
        isLoggedIn: worknoonChatData.isLoggedIn || false,
        messages: [],
        pollingInterval: null,
        isWidgetOpen: false,
        lastMessageId: null,

        init: function() {
            this.cacheElements();
            this.bindEvents();
            this.checkExistingSession();
        },

        cacheElements: function() {
            this.$widget = $('#worknoon-chat-widget');
            this.$fab = $('#worknoon-chat-fab');
            this.$container = $('#worknoon-chat-container');
            this.$messages = $('#worknoon-chat-messages');
            this.$textarea = $('#worknoon-chat-textarea');
            this.$sendBtn = $('#worknoon-chat-send');
            this.$closeBtn = $('#worknoon-chat-close');
            this.$typingIndicator = $('#chat-typing-indicator');
            this.$notificationBadge = $('#chat-notification-badge');
        },

        bindEvents: function() {
            var self = this;

            // Toggle widget
            this.$fab.on('click', function() {
                self.toggleWidget();
            });

            this.$closeBtn.on('click', function() {
                self.closeWidget();
            });

            // Send message
            this.$sendBtn.on('click', function() {
                self.sendMessage();
            });

            // Send on Enter key (Shift+Enter for new line)
            this.$textarea.on('keypress', function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    self.sendMessage();
                }
            });

            // Auto-resize textarea
            this.$textarea.on('input', function() {
                self.autoResizeTextarea(this);
            });

            // Product chat button
            $(document).on('click', '.worknoon-product-chat-btn', function(e) {
                e.preventDefault();
                var productId = $(this).data('product-id');
                self.startProductChat(productId);
            });

            // Order chat button
            $(document).on('click', '.worknoon-order-chat-btn', function(e) {
                e.preventDefault();
                var orderId = $(this).data('order-id');
                var sessionId = $(this).data('session-id');
                self.startOrderChat(orderId, sessionId);
            });
        },

        autoResizeTextarea: function(element) {
            $(element).css('height', 'auto');
            $(element).css('height', element.scrollHeight + 'px');
        },

        toggleWidget: function() {
            this.isWidgetOpen = !this.isWidgetOpen;
            this.$container.toggleClass('active', this.isWidgetOpen);

            if (this.isWidgetOpen) {
                this.$textarea.focus();
                if (this.sessionId) {
                    this.loadMessages();
                    this.startPolling();
                } else {
                    this.showWelcomeMessage();
                }
            } else {
                this.stopPolling();
            }
        },

        closeWidget: function() {
            this.isWidgetOpen = false;
            this.$container.removeClass('active');
            this.stopPolling();
        },

        showWelcomeMessage: function() {
            if (this.messages.length === 0) {
                this.$messages.html(
                    '<div class="chat-empty-state">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
                            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />' +
                        '</svg>' +
                        '<p>Welcome! How can we help you today?</p>' +
                    '</div>'
                );
            }
        },

        checkExistingSession: function() {
            var self = this;

            // Check for session in URL
            var urlParams = new URLSearchParams(window.location.search);
            var sessionId = urlParams.get('chat_session');

            if (sessionId) {
                this.sessionId = sessionId;
                this.openWidget();
                this.loadMessages();
                this.startPolling();
            }
        },

        startProductChat: function(productId) {
            var self = this;

            if (!this.isLoggedIn) {
                alert('Please log in to start a chat.');
                return;
            }

            this.showLoading();

            $.ajax({
                url: worknoonChatData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_get_session',
                    nonce: worknoonChatData.nonce,
                    context: 'product',
                    context_id: productId
                },
                success: function(response) {
                    if (response.success) {
                        self.sessionId = response.data.session_id;
                        self.openWidget();
                        self.loadMessages();
                        self.startPolling();

                        if (response.data.new) {
                            self.addSystemMessage('Chat started for this product. An agent will be with you shortly.');
                        }
                    } else {
                        alert('Failed to start chat. Please try again.');
                    }
                },
                error: function() {
                    alert('Failed to start chat. Please try again.');
                },
                complete: function() {
                    self.hideLoading();
                }
            });
        },

        startOrderChat: function(orderId, sessionId) {
            this.sessionId = sessionId;
            this.openWidget();
            this.loadMessages();
            this.startPolling();
        },

        sendMessage: function() {
            var content = this.$textarea.val().trim();

            if (!content) {
                return;
            }

            if (!this.isLoggedIn) {
                alert('Please log in to send messages.');
                return;
            }

            var self = this;

            // Optimistically add message
            var tempMessage = {
                id: 'temp-' + Date.now(),
                sender_id: this.userId,
                sender_name: this.userName,
                content: content,
                timestamp: new Date().toISOString(),
                isOwn: true
            };

            this.addMessageToUI(tempMessage);
            this.$textarea.val('').css('height', 'auto');
            this.scrollToBottom();

            // Send via AJAX
            $.ajax({
                url: worknoonChatData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_send_message',
                    nonce: worknoonChatData.nonce,
                    message: content,
                    session_id: this.sessionId
                },
                success: function(response) {
                    if (response.success) {
                        // Update session ID if new
                        if (!self.sessionId && response.data.session_id) {
                            self.sessionId = response.data.session_id;
                            self.startPolling();
                        }

                        // Replace temp message with confirmed
                        self.replaceTempMessage(tempMessage.id, response.data.message);
                    } else {
                        self.markMessageFailed(tempMessage.id);
                    }
                },
                error: function() {
                    self.markMessageFailed(tempMessage.id);
                }
            });
        },

        loadMessages: function() {
            if (!this.sessionId) {
                return;
            }

            var self = this;

            $.ajax({
                url: worknoonChatData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'worknoon_chat_get_messages',
                    nonce: worknoonChatData.nonce,
                    session_id: this.sessionId,
                    last_id: this.lastMessageId
                },
                success: function(response) {
                    if (response.success && response.data.messages) {
                        self.renderMessages(response.data.messages);
                    }
                }
            });
        },

        startPolling: function() {
            var self = this;

            // Poll every 3 seconds
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

        renderMessages: function(newMessages) {
            var self = this;

            if (newMessages.length === 0) {
                return;
            }

            // Remove empty state if exists
            this.$messages.find('.chat-empty-state').remove();

            // Add new messages
            $.each(newMessages, function(index, message) {
                // Check if message already exists
                if ($('[data-message-id="' + message.id + '"]').length === 0) {
                    self.addMessageToUI(message);
                    self.lastMessageId = message.id;

                    // Show notification if widget is closed and not own message
                    if (!self.isWidgetOpen && message.sender_id != self.userId) {
                        self.showNotification();
                    }
                }
            });

            this.scrollToBottom();
        },

        addMessageToUI: function(message) {
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

            this.$messages.append(html);
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
                $tempMessage.attr('data-message-id', confirmedMessage.id);
                $tempMessage.removeClass('sending');
            }
        },

        markMessageFailed: function(messageId) {
            var $message = this.$messages.find('[data-message-id="' + messageId + '"]');
            $message.addClass('failed');
            $message.find('.chat-message-bubble').append(' <span style="color: #ef4444;">(Failed)</span>');
        },

        showLoading: function() {
            this.$messages.html(
                '<div class="chat-loading">' +
                    '<div class="chat-loading-spinner"></div>' +
                '</div>'
            );
        },

        hideLoading: function() {
            this.$messages.find('.chat-loading').remove();
        },

        showNotification: function() {
            var $badge = this.$notificationBadge;
            var count = parseInt($badge.text()) || 0;
            $badge.text(count + 1).show();

            // Pulse animation
            this.$fab.addClass('has-notification');
            setTimeout(function() {
                this.$fab.removeClass('has-notification');
            }.bind(this), 500);
        },

        clearNotification: function() {
            this.$notificationBadge.text('0').hide();
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

        openWidget: function() {
            this.isWidgetOpen = true;
            this.$container.addClass('active');
            this.clearNotification();
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        WorknoonChat.init();
    });

    // Expose to global scope
    window.WorknoonChat = WorknoonChat;

})(jQuery);
