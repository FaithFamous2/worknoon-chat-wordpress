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

    // Chat widget script - with aggressive cache busting
    wp_enqueue_script('worknoon-chat-widget',
        get_stylesheet_directory_uri() . '/js/chat-widget.js?ver=' . time(),
        array('jquery'),
        time(), // Use timestamp as version
        true
    );

    // Get backend connection settings (from plugin settings array or defaults)
    $settings = get_option('worknoon_chat_settings', array());
    $api_endpoint = $settings['api_endpoint'] ?? 'http://localhost:5001/api';
    $socket_endpoint = $settings['socket_endpoint'] ?? 'http://localhost:5001';
    $allow_guest_chat = $settings['allow_guest_chat'] ?? false;
    $primary_color = $settings['primary_color'] ?? '#4f46e5';

    // Get user backend data if logged in
    $user_id = get_current_user_id();
    $backend_user_id = '';
    $jwt_token = '';

    if ($user_id) {
        $backend_user_id = get_user_meta($user_id, '_worknoon_backend_id', true);
        $jwt_token = get_user_meta($user_id, '_worknoon_jwt_token', true);
    }

    // Localize script with all necessary data
    wp_localize_script('worknoon-chat-widget', 'worknoonChatData', array(
        'ajaxUrl'       => admin_url('admin-ajax.php'),
        'apiUrl'        => $api_endpoint,
        'socketUrl'     => $socket_endpoint,
        'nonce'         => wp_create_nonce('worknoon_chat_nonce'),
        'userId'        => $user_id,
        'backendUserId' => $backend_user_id,
        'userName'      => wp_get_current_user()->display_name,
        'userEmail'     => wp_get_current_user()->user_email,
        'isLoggedIn'    => is_user_logged_in(),
        'jwtToken'      => $jwt_token,
        'loginUrl'      => wp_login_url(),
        'allowGuestChat'=> $allow_guest_chat,
        'primaryColor'  => $primary_color,
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
        <!-- Dynamic Content Area -->
        <div class="worknoon-chat-content" id="worknoon-chat-content">
            <!-- Content will be dynamically rendered by JavaScript -->
            <div class="chat-loading">
                <div class="chat-loading-spinner"></div>
                <p>Loading...</p>
            </div>
        </div>
    </div>
    </div>
    <?php
}

/**
 * Theme uses Node.js backend directly via JavaScript
 * No WordPress AJAX handlers needed - all API calls go to the Node.js backend
 */

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
