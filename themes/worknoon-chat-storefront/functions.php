<?php
/**
 * Worknoon Chat Storefront Child Theme functions and definitions
 *
 * @package Worknoon_Chat_Storefront
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Enqueue parent and child theme styles
 */
add_action('wp_enqueue_scripts', 'worknoon_chat_storefront_enqueue_styles');
function worknoon_chat_storefront_enqueue_styles() {
    // Parent theme style
    wp_enqueue_style('storefront-style', get_template_directory_uri() . '/style.css');

    // Child theme style
    wp_enqueue_style('worknoon-chat-storefront-style',
        get_stylesheet_directory_uri() . '/style.css',
        array('storefront-style'),
        wp_get_theme()->get('Version')
    );

    // Chat widget script
    wp_enqueue_script('worknoon-chat-widget',
        get_stylesheet_directory_uri() . '/js/chat-widget.js',
        array('jquery'),
        wp_get_theme()->get('Version'),
        true
    );

    // Localize script with AJAX URL and nonce
    wp_localize_script('worknoon-chat-widget', 'worknoonChatData', array(
        'ajaxUrl'    => admin_url('admin-ajax.php'),
        'restUrl'    => get_rest_url(null, 'worknoon-chat/v1'),
        'nonce'      => wp_create_nonce('worknoon_chat_nonce'),
        'userId'     => get_current_user_id(),
        'userName'   => wp_get_current_user()->display_name,
        'isLoggedIn' => is_user_logged_in(),
    ));
}

/**
 * Add floating chat widget to footer
 */
add_action('wp_footer', 'worknoon_chat_add_floating_widget');
function worknoon_chat_add_floating_widget() {
    // Don't show on admin pages
    if (is_admin()) {
        return;
    }

    $user_id = get_current_user_id();
    $user_name = $user_id ? wp_get_current_user()->display_name : 'Guest';
    ?>
    <!-- Worknoon Chat Widget -->
    <div id="worknoon-chat-widget" class="worknoon-chat-widget" data-user-id="<?php echo esc_attr($user_id); ?>">
        <!-- Floating Action Button -->
        <button class="worknoon-chat-fab" id="worknoon-chat-fab" aria-label="Open chat">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span class="chat-notification-badge" id="chat-notification-badge" style="display: none;">0</span>
        </button>

        <!-- Chat Container -->
        <div class="worknoon-chat-container" id="worknoon-chat-container">
            <!-- Chat Header -->
            <div class="worknoon-chat-header">
                <div>
                    <h3>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        Chat Support
                    </h3>
                    <div class="status">
                        <span class="status-dot"></span>
                        <span>Online</span>
                    </div>
                </div>
                <button class="worknoon-chat-close" id="worknoon-chat-close" aria-label="Close chat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <!-- Chat Messages -->
            <div class="worknoon-chat-messages" id="worknoon-chat-messages">
                <div class="chat-empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>Welcome! How can we help you today?</p>
                </div>
            </div>

            <!-- Typing Indicator (hidden by default) -->
            <div class="chat-typing-indicator" id="chat-typing-indicator" style="display: none;">
                <span>Agent is typing</span>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>

            <!-- Chat Input -->
            <div class="worknoon-chat-input">
                <textarea
                    id="worknoon-chat-textarea"
                    placeholder="Type your message..."
                    rows="1"
                    maxlength="1000"
                ></textarea>
                <button class="worknoon-chat-send" id="worknoon-chat-send" aria-label="Send message">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    </div>
    <?php
}

/**
 * AJAX handler: Send message
 */
add_action('wp_ajax_worknoon_chat_send_message', 'worknoon_chat_ajax_send_message');
add_action('wp_ajax_nopriv_worknoon_chat_send_message', 'worknoon_chat_ajax_nopriv_send_message');

function worknoon_chat_ajax_send_message() {
    check_ajax_referer('worknoon_chat_nonce', 'nonce');

    $message = sanitize_textarea_field($_POST['message']);
    $session_id = isset($_POST['session_id']) ? intval($_POST['session_id']) : 0;
    $user_id = get_current_user_id();

    if (empty($message)) {
        wp_send_json_error('Message is empty');
    }

    // Create session if doesn't exist
    if (!$session_id) {
        $session_id = worknoon_chat_create_session($user_id);
    }

    // Save message
    $message_data = array(
        'id'         => uniqid('msg_'),
        'session_id' => $session_id,
        'sender_id'  => $user_id,
        'sender_name'=> wp_get_current_user()->display_name,
        'content'    => $message,
        'timestamp'  => current_time('mysql'),
        'read'       => false,
    );

    $messages = get_post_meta($session_id, '_chat_messages', true);
    if (!is_array($messages)) {
        $messages = array();
    }
    $messages[] = $message_data;
    update_post_meta($session_id, '_chat_messages', $messages);
    update_post_meta($session_id, '_chat_last_activity', current_time('mysql'));

    // Mark as unread for other participants
    $participants = get_post_meta($session_id, '_chat_participants', true);
    if (is_array($participants)) {
        foreach ($participants as $participant_id) {
            if ($participant_id != $user_id) {
                $unread = get_post_meta($session_id, '_chat_unread_' . $participant_id, true);
                update_post_meta($session_id, '_chat_unread_' . $participant_id, intval($unread) + 1);
            }
        }
    }

    // Send email notification to agents
    worknoon_chat_send_notification($session_id, $message_data);

    wp_send_json_success(array(
        'message'    => $message_data,
        'session_id' => $session_id,
    ));
}

function worknoon_chat_ajax_nopriv_send_message() {
    wp_send_json_error('Please log in to send messages');
}

/**
 * AJAX handler: Get messages
 */
add_action('wp_ajax_worknoon_chat_get_messages', 'worknoon_chat_ajax_get_messages');
add_action('wp_ajax_nopriv_worknoon_chat_get_messages', 'worknoon_chat_ajax_nopriv_get_messages');

function worknoon_chat_ajax_get_messages() {
    check_ajax_referer('worknoon_chat_nonce', 'nonce');

    $session_id = isset($_POST['session_id']) ? intval($_POST['session_id']) : 0;
    $last_id = isset($_POST['last_id']) ? sanitize_text_field($_POST['last_id']) : '';
    $user_id = get_current_user_id();

    if (!$session_id) {
        // Return empty if no session
        wp_send_json_success(array('messages' => array()));
    }

    $messages = get_post_meta($session_id, '_chat_messages', true);
    if (!is_array($messages)) {
        $messages = array();
    }

    // Filter messages after last_id if provided
    if ($last_id) {
        $found = false;
        $new_messages = array();
        foreach ($messages as $msg) {
            if ($found) {
                $new_messages[] = $msg;
            }
            if ($msg['id'] === $last_id) {
                $found = true;
            }
        }
        $messages = $new_messages;
    }

    // Mark messages as read for current user
    update_post_meta($session_id, '_chat_unread_' . $user_id, 0);

    wp_send_json_success(array(
        'messages'   => $messages,
        'session_id'   => $session_id,
    ));
}

function worknoon_chat_ajax_nopriv_get_messages() {
    wp_send_json_error('Please log in to view messages');
}

/**
 * AJAX handler: Get or create session
 */
add_action('wp_ajax_worknoon_chat_get_session', 'worknoon_chat_ajax_get_session');

function worknoon_chat_ajax_get_session() {
    check_ajax_referer('worknoon_chat_nonce', 'nonce');

    $user_id = get_current_user_id();
    $context = isset($_POST['context']) ? sanitize_text_field($_POST['context']) : 'general';
    $context_id = isset($_POST['context_id']) ? intval($_POST['context_id']) : 0;

    // Check for existing active session
    $existing_session = worknoon_chat_find_existing_session($user_id, $context, $context_id);

    if ($existing_session) {
        wp_send_json_success(array(
            'session_id' => $existing_session,
            'new'        => false,
        ));
    }

    // Create new session
    $session_id = worknoon_chat_create_session($user_id, $context, $context_id);

    wp_send_json_success(array(
        'session_id' => $session_id,
        'new'        => true,
    ));
}

/**
 * Create new chat session
 */
function worknoon_chat_create_session($user_id, $context = 'general', $context_id = 0) {
    $title = 'Chat Session';

    // Context-specific titles
    if ($context === 'order' && $context_id) {
        $title = sprintf('Order #%d Chat', $context_id);
    } elseif ($context === 'product' && $context_id) {
        $product = wc_get_product($context_id);
        $title = $product ? sprintf('Product: %s Chat', $product->get_name()) : 'Product Chat';
    }

    $session_data = array(
        'post_title'  => $title,
        'post_type'   => 'chat_session',
        'post_status' => 'publish',
        'post_author' => $user_id,
    );

    $session_id = wp_insert_post($session_data);

    if (!is_wp_error($session_id)) {
        $participants = array($user_id);

        // Assign to available agent
        $agent_id = worknoon_chat_find_available_agent();
        if ($agent_id) {
            $participants[] = $agent_id;
        }

        update_post_meta($session_id, '_chat_participants', $participants);
        update_post_meta($session_id, '_chat_status', 'active');
        update_post_meta($session_id, '_chat_type', $context);
        update_post_meta($session_id, '_chat_created', current_time('mysql'));

        if ($context_id) {
            update_post_meta($session_id, '_chat_context_id', $context_id);
        }

        // Notify agent
        if ($agent_id) {
            worknoon_chat_notify_agent($agent_id, $session_id, $user_id);
        }
    }

    return $session_id;
}

/**
 * Find existing active session
 */
function worknoon_chat_find_existing_session($user_id, $context, $context_id) {
    $args = array(
        'post_type'      => 'chat_session',
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'meta_query'     => array(
            'relation' => 'AND',
            array(
                'key'     => '_chat_participants',
                'value'   => $user_id,
                'compare' => 'LIKE',
            ),
            array(
                'key'     => '_chat_status',
                'value'   => 'active',
                'compare' => '=',
            ),
        ),
    );

    if ($context_id) {
        $args['meta_query'][] = array(
            'key'     => '_chat_context_id',
            'value'   => $context_id,
            'compare' => '=',
        );
    }

    $sessions = get_posts($args);

    return !empty($sessions) ? $sessions[0]->ID : false;
}

/**
 * Find available agent
 */
function worknoon_chat_find_available_agent() {
    $agents = get_users(array(
        'role__in' => array('administrator', 'shop_manager', 'support_agent'),
        'orderby'  => 'rand',
    ));

    // For now, return first agent. In production, check online status and workload
    return !empty($agents) ? $agents[0]->ID : 0;
}

/**
 * Send notification to agent
 */
function worknoon_chat_notify_agent($agent_id, $session_id, $customer_id) {
    $agent = get_userdata($agent_id);
    $customer = get_userdata($customer_id);

    if (!$agent || !$customer) {
        return;
    }

    $subject = sprintf('New Chat Session: %s', $customer->display_name);
    $message = sprintf(
        "A new chat session has been started by %s.\n\nView Session: %s",
        $customer->display_name,
        admin_url('post.php?post=' . $session_id . '&action=edit')
    );

    wp_mail($agent->user_email, $subject, $message);
}

/**
 * Send email notification
 */
function worknoon_chat_send_notification($session_id, $message_data) {
    $participants = get_post_meta($session_id, '_chat_participants', true);

    if (!is_array($participants)) {
        return;
    }

    foreach ($participants as $participant_id) {
        if ($participant_id == $message_data['sender_id']) {
            continue;
        }

        $user = get_userdata($participant_id);
        if (!$user) {
            continue;
        }

        $subject = sprintf('New message from %s', $message_data['sender_name']);
        $body = sprintf(
            "You have a new message:\n\nFrom: %s\nMessage: %s\n\nView chat: %s",
            $message_data['sender_name'],
            $message_data['content'],
            admin_url('post.php?post=' . $session_id . '&action=edit')
        );

        wp_mail($user->user_email, $subject, $body);
    }
}

/**
 * WooCommerce: Add chat to order page
 */
add_action('woocommerce_order_details_after_order_table', 'worknoon_chat_add_to_order_page', 10, 1);
function worknoon_chat_add_to_order_page($order) {
    $order_id = $order->get_id();
    $user_id = get_current_user_id();

    // Get or create session for this order
    $session_id = worknoon_chat_get_or_create_order_session($order_id, $user_id);

    ?>
    <div class="order-chat-section">
        <h3>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Order Chat
        </h3>
        <p>Have questions about this order? Chat with our support team.</p>
        <button class="button worknoon-order-chat-btn" data-order-id="<?php echo esc_attr($order_id); ?>" data-session-id="<?php echo esc_attr($session_id); ?>">
            Start Chat
        </button>
    </div>
    <?php
}

/**
 * Get or create order session
 */
function worknoon_chat_get_or_create_order_session($order_id, $user_id) {
    $session_id = get_post_meta($order_id, '_chat_session_id', true);

    if ($session_id) {
        return $session_id;
    }

    $session_id = worknoon_chat_create_session($user_id, 'order', $order_id);

    if (!is_wp_error($session_id)) {
        update_post_meta($order_id, '_chat_session_id', $session_id);
    }

    return $session_id;
}

/**
 * WooCommerce: Add chat button to product page
 */
add_action('woocommerce_single_product_summary', 'worknoon_chat_add_to_product_page', 35);
function worknoon_chat_add_to_product_page() {
    global $product;

    if (!$product) {
        return;
    }

    $product_id = $product->get_id();
    ?>
    <div class="product-chat-button">
        <h4>Questions about this product?</h4>
        <a href="#" class="product-chat-btn worknoon-product-chat-btn" data-product-id="<?php echo esc_attr($product_id); ?>">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Chat with us
        </a>
    </div>
    <?php
}

/**
 * Register chat session post type (if not already registered by plugin)
 */
add_action('init', 'worknoon_chat_register_post_type');
function worknoon_chat_register_post_type() {
    if (post_type_exists('chat_session')) {
        return;
    }

    register_post_type('chat_session', array(
        'labels' => array(
            'name'          => 'Chat Sessions',
            'singular_name' => 'Chat Session',
            'menu_name'     => 'Chat Sessions',
        ),
        'public'       => false,
        'show_ui'      => true,
        'show_in_menu' => true,
        'menu_icon'    => 'dashicons-format-chat',
        'supports'     => array('title', 'author'),
        'show_in_rest' => true,
    ));
}

/**
 * Theme setup
 */
add_action('after_setup_theme', 'worknoon_chat_storefront_setup');
function worknoon_chat_storefront_setup() {
    // Add theme support
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption'));

    // Load text domain
    load_child_theme_textdomain('worknoon-chat-storefront', get_stylesheet_directory() . '/languages');
}
