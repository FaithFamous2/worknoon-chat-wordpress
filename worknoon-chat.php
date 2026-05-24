<?php
/**
 * Plugin Name: Worknoon Chat
 * Plugin URI: https://worknoon.com
 * Description: Real-time chat integration for eCommerce platforms. Enables communication between customers, agents, designers, and merchants.
 * Version: 1.0.0
 * Author: Worknoon
 * Author URI: https://worknoon.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: worknoon-chat
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

// Check PHP version
if (version_compare(PHP_VERSION, '7.4', '<')) {
    add_action('admin_notices', function() {
        echo '<div class="error"><p><strong>Worknoon Chat:</strong> Requires PHP 7.4 or higher. Your current PHP version is ' . PHP_VERSION . '</p></div>';
    });
    return;
}

define('WORKNOON_CHAT_VERSION', '1.0.0');
define('WORKNOON_CHAT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WORKNOON_CHAT_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Main Worknoon Chat Plugin Class
 */
class Worknoon_Chat {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->init();
    }

    private function init() {
        // Register post type
        add_action('init', array($this, 'register_chat_session_post_type'));

        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Admin menu
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Enqueue scripts
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_scripts'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));

        // Shortcodes
        add_shortcode('worknoon_chat', array($this, 'render_chat_widget'));
        add_shortcode('worknoon_chat_button', array($this, 'render_chat_button'));

        // AJAX handlers
        add_action('wp_ajax_worknoon_send_message', array($this, 'ajax_send_message'));
        add_action('wp_ajax_nopriv_worknoon_send_message', array($this, 'ajax_nopriv_send_message'));
        add_action('wp_ajax_worknoon_get_messages', array($this, 'ajax_get_messages'));
        add_action('wp_ajax_nopriv_worknoon_get_messages', array($this, 'ajax_nopriv_get_messages'));

        // WooCommerce integration
        if (class_exists('WooCommerce')) {
            add_action('woocommerce_order_details_after_order_table', array($this, 'add_chat_to_order_page'));
            add_action('woocommerce_single_product_summary', array($this, 'add_chat_to_product_page'), 35);
        }

        // Activation/Deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }

    /**
     * Register Chat Session Custom Post Type
     */
    public function register_chat_session_post_type() {
        $labels = array(
            'name'                  => __('Chat Sessions', 'worknoon-chat'),
            'singular_name'         => __('Chat Session', 'worknoon-chat'),
            'menu_name'             => __('Chat Sessions', 'worknoon-chat'),
            'add_new'               => __('Add New', 'worknoon-chat'),
            'add_new_item'          => __('Add New Chat Session', 'worknoon-chat'),
            'edit_item'             => __('Edit Chat Session', 'worknoon-chat'),
            'new_item'              => __('New Chat Session', 'worknoon-chat'),
            'view_item'             => __('View Chat Session', 'worknoon-chat'),
            'search_items'          => __('Search Chat Sessions', 'worknoon-chat'),
            'not_found'             => __('No chat sessions found', 'worknoon-chat'),
            'not_found_in_trash'    => __('No chat sessions found in trash', 'worknoon-chat'),
        );

        $args = array(
            'labels'                => $labels,
            'public'                => false,
            'publicly_queryable'    => false,
            'show_ui'               => true,
            'show_in_menu'          => true,
            'capability_type'       => 'post',
            'has_archive'           => false,
            'hierarchical'          => false,
            'menu_position'         => 30,
            'menu_icon'             => 'dashicons-format-chat',
            'supports'              => array('title', 'author', 'custom-fields'),
            'show_in_rest'          => true,
            'rest_base'             => 'chat-sessions',
        );

        register_post_type('chat_session', $args);
    }

    /**
     * Register REST API Routes
     */
    public function register_rest_routes() {
        register_rest_route('worknoon-chat/v1', '/sessions', array(
            'methods'               => 'GET',
            'callback'              => array($this, 'rest_get_sessions'),
            'permission_callback'   => array($this, 'rest_permission_check'),
        ));

        register_rest_route('worknoon-chat/v1', '/sessions', array(
            'methods'               => 'POST',
            'callback'              => array($this, 'rest_create_session'),
            'permission_callback'   => array($this, 'rest_permission_check'),
        ));

        register_rest_route('worknoon-chat/v1', '/sessions/(?P<id>\d+)/messages', array(
            'methods'               => 'GET',
            'callback'              => array($this, 'rest_get_messages'),
            'permission_callback'   => array($this, 'rest_permission_check'),
        ));

        register_rest_route('worknoon-chat/v1', '/sessions/(?P<id>\d+)/messages', array(
            'methods'               => 'POST',
            'callback'              => array($this, 'rest_send_message'),
            'permission_callback'   => array($this, 'rest_permission_check'),
        ));

        register_rest_route('worknoon-chat/v1', '/agents', array(
            'methods'               => 'GET',
            'callback'              => array($this, 'rest_get_agents'),
            'permission_callback'   => '__return_true',
        ));

        register_rest_route('worknoon-chat/v1', '/settings', array(
            'methods'               => 'GET',
            'callback'              => array($this, 'rest_get_settings'),
            'permission_callback'   => '__return_true',
        ));
    }

    /**
     * REST API Permission Check
     */
    public function rest_permission_check() {
        return is_user_logged_in() || $this->allow_guest_chat();
    }

    /**
     * Check if guest chat is allowed
     */
    private function allow_guest_chat() {
        $settings = get_option('worknoon_chat_settings', array());
        return !empty($settings['allow_guest_chat']);
    }

    /**
     * REST: Get Chat Sessions
     */
    public function rest_get_sessions($request) {
        $user_id = get_current_user_id();

        $args = array(
            'post_type'         => 'chat_session',
            'posts_per_page'    => -1,
            'meta_query'        => array(
                array(
                    'key'       => '_chat_participants',
                    'value'     => $user_id,
                    'compare'   => 'LIKE',
                ),
            ),
        );

        $sessions = get_posts($args);
        $data = array();

        foreach ($sessions as $session) {
            $data[] = $this->format_session_data($session);
        }

        return rest_ensure_response($data);
    }

    /**
     * REST: Create Chat Session
     */
    public function rest_create_session($request) {
        $params = $request->get_params();
        $user_id = get_current_user_id();

        $session_data = array(
            'post_title'    => sanitize_text_field($params['title'] ?? 'Chat Session'),
            'post_type'     => 'chat_session',
            'post_status'   => 'publish',
            'post_author'   => $user_id,
        );

        $session_id = wp_insert_post($session_data);

        if (is_wp_error($session_id)) {
            return new WP_Error('create_failed', 'Failed to create chat session', array('status' => 500));
        }

        // Store participants
        $participants = array($user_id);
        if (!empty($params['agent_id'])) {
            $participants[] = intval($params['agent_id']);
        }

        update_post_meta($session_id, '_chat_participants', $participants);
        update_post_meta($session_id, '_chat_status', 'active');
        update_post_meta($session_id, '_chat_type', sanitize_text_field($params['type'] ?? 'general'));

        // Store WooCommerce context if available
        if (!empty($params['order_id'])) {
            update_post_meta($session_id, '_wc_order_id', intval($params['order_id']));
        }
        if (!empty($params['product_id'])) {
            update_post_meta($session_id, '_wc_product_id', intval($params['product_id']));
        }

        return rest_ensure_response(array(
            'id'    => $session_id,
            'title' => $session_data['post_title'],
            'status'=> 'active',
        ));
    }

    /**
     * REST: Get Messages
     */
    public function rest_get_messages($request) {
        $session_id = $request['id'];
        $messages = get_post_meta($session_id, '_chat_messages', true);

        if (!is_array($messages)) {
            $messages = array();
        }

        // Mark messages as read
        $user_id = get_current_user_id();
        $unread_key = '_chat_unread_' . $user_id;
        delete_post_meta($session_id, $unread_key);

        return rest_ensure_response($messages);
    }

    /**
     * REST: Send Message
     */
    public function rest_send_message($request) {
        $session_id = $request['id'];
        $params = $request->get_params();
        $user_id = get_current_user_id();

        $message = array(
            'id'            => uniqid('msg_'),
            'sender_id'     => $user_id,
            'sender_name'   => $this->get_user_display_name($user_id),
            'content'       => sanitize_textarea_field($params['content']),
            'timestamp'     => current_time('mysql'),
            'attachments'   => !empty($params['attachments']) ? $params['attachments'] : array(),
        );

        $messages = get_post_meta($session_id, '_chat_messages', true);
        if (!is_array($messages)) {
            $messages = array();
        }

        $messages[] = $message;
        update_post_meta($session_id, '_chat_messages', $messages);

        // Update last activity
        update_post_meta($session_id, '_chat_last_activity', current_time('mysql'));

        // Mark as unread for other participants
        $participants = get_post_meta($session_id, '_chat_participants', true);
        if (is_array($participants)) {
            foreach ($participants as $participant_id) {
                if ($participant_id != $user_id) {
                    $unread_count = get_post_meta($session_id, '_chat_unread_' . $participant_id, true);
                    $unread_count = intval($unread_count) + 1;
                    update_post_meta($session_id, '_chat_unread_' . $participant_id, $unread_count);
                }
            }
        }

        // Send email notification
        $this->send_message_notification($session_id, $message);

        return rest_ensure_response($message);
    }

    /**
     * REST: Get Available Agents
     */
    public function rest_get_agents() {
        $agents = get_users(array(
            'role__in'  => array('administrator', 'shop_manager', 'support_agent'),
            'fields'    => array('ID', 'display_name', 'user_email'),
        ));

        $data = array();
        foreach ($agents as $agent) {
            $data[] = array(
                'id'        => $agent->ID,
                'name'      => $agent->display_name,
                'email'     => $agent->user_email,
                'avatar'    => get_avatar_url($agent->ID),
                'online'    => $this->is_user_online($agent->ID),
            );
        }

        return rest_ensure_response($data);
    }

    /**
     * REST: Get Plugin Settings
     */
    public function rest_get_settings() {
        $settings = get_option('worknoon_chat_settings', array());

        return rest_ensure_response(array(
            'api_url'           => get_rest_url(null, 'worknoon-chat/v1'),
            'ajax_url'          => admin_url('admin-ajax.php'),
            'nonce'             => wp_create_nonce('worknoon_chat_nonce'),
            'allow_guest_chat'  => !empty($settings['allow_guest_chat']),
            'primary_color'     => $settings['primary_color'] ?? '#4f46e5',
            'position'          => $settings['position'] ?? 'bottom-right',
        ));
    }

    /**
     * Format session data for API response
     */
    private function format_session_data($session) {
        $participants = get_post_meta($session->ID, '_chat_participants', true);
        $last_activity = get_post_meta($session->ID, '_chat_last_activity', true);

        return array(
            'id'            => $session->ID,
            'title'         => $session->post_title,
            'status'        => get_post_meta($session->ID, '_chat_status', true),
            'type'          => get_post_meta($session->ID, '_chat_type', true),
            'participants'  => $participants,
            'last_activity' => $last_activity,
            'created_at'    => $session->post_date,
        );
    }

    /**
     * Get user display name
     */
    private function get_user_display_name($user_id) {
        $user = get_userdata($user_id);
        return $user ? $user->display_name : 'Guest';
    }

    /**
     * Check if user is online
     */
    private function is_user_online($user_id) {
        $last_activity = get_user_meta($user_id, '_last_activity', true);
        if (empty($last_activity)) {
            return false;
        }

        $time_diff = time() - strtotime($last_activity);
        return $time_diff < 300; // 5 minutes
    }

    /**
     * Send message notification email
     */
    private function send_message_notification($session_id, $message) {
        $settings = get_option('worknoon_chat_settings', array());
        if (empty($settings['email_notifications'])) {
            return;
        }

        $participants = get_post_meta($session_id, '_chat_participants', true);
        if (!is_array($participants)) {
            return;
        }

        $session = get_post($session_id);
        $subject = sprintf(__('New message in chat: %s', 'worknoon-chat'), $session->post_title);

        foreach ($participants as $participant_id) {
            if ($participant_id == $message['sender_id']) {
                continue;
            }

            $user = get_userdata($participant_id);
            if (!$user) {
                continue;
            }

            $body = sprintf(
                __("You have a new message from %s:\n\n%s\n\nView chat: %s", 'worknoon-chat'),
                $message['sender_name'],
                $message['content'],
                admin_url('post.php?post=' . $session_id . '&action=edit')
            );

            wp_mail($user->user_email, $subject, $body);
        }
    }

    /**
     * Enqueue frontend scripts
     */
    public function enqueue_frontend_scripts() {
        // Only enqueue if chat is enabled
        $settings = get_option('worknoon_chat_settings', array());
        if (empty($settings['enable_chat'])) {
            return;
        }

        wp_enqueue_style(
            'worknoon-chat-style',
            WORKNOON_CHAT_PLUGIN_URL . 'assets/css/chat-widget.css',
            array(),
            WORKNOON_CHAT_VERSION
        );

        wp_enqueue_script(
            'worknoon-chat-script',
            WORKNOON_CHAT_PLUGIN_URL . 'assets/js/chat-widget.js',
            array('jquery'),
            WORKNOON_CHAT_VERSION,
            true
        );

        wp_localize_script('worknoon-chat-script', 'worknoonChat', array(
            'ajaxUrl'       => admin_url('admin-ajax.php'),
            'restUrl'       => get_rest_url(null, 'worknoon-chat/v1'),
            'nonce'         => wp_create_nonce('worknoon_chat_nonce'),
            'userId'        => get_current_user_id(),
            'userName'      => $this->get_user_display_name(get_current_user_id()),
            'isLoggedIn'    => is_user_logged_in(),
            'settings'      => $settings,
        ));
    }

    /**
     * Enqueue admin scripts
     */
    public function enqueue_admin_scripts($hook) {
        if ('post.php' !== $hook && 'post-new.php' !== $hook) {
            return;
        }

        $screen = get_current_screen();
        if ($screen->post_type !== 'chat_session') {
            return;
        }

        wp_enqueue_style(
            'worknoon-chat-admin-style',
            WORKNOON_CHAT_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            WORKNOON_CHAT_VERSION
        );

        wp_enqueue_script(
            'worknoon-chat-admin-script',
            WORKNOON_CHAT_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            WORKNOON_CHAT_VERSION,
            true
        );
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'edit.php?post_type=chat_session',
            __('Chat Settings', 'worknoon-chat'),
            __('Settings', 'worknoon-chat'),
            'manage_options',
            'worknoon-chat-settings',
            array($this, 'render_settings_page')
        );
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (isset($_POST['save_worknoon_settings'])) {
            check_admin_referer('worknoon_chat_settings');

            $settings = array(
                'enable_chat'       => isset($_POST['enable_chat']),
                'allow_guest_chat'  => isset($_POST['allow_guest_chat']),
                'email_notifications'=> isset($_POST['email_notifications']),
                'primary_color'     => sanitize_hex_color($_POST['primary_color']),
                'position'          => sanitize_text_field($_POST['position']),
                'api_endpoint'      => esc_url_raw($_POST['api_endpoint']),
            );

            update_option('worknoon_chat_settings', $settings);
            echo '<div class="notice notice-success"><p>' . __('Settings saved.', 'worknoon-chat') . '</p></div>';
        }

        $settings = get_option('worknoon_chat_settings', array());
        ?>
        <div class="wrap">
            <h1><?php _e('Worknoon Chat Settings', 'worknoon-chat'); ?></h1>
            <form method="post">
                <?php wp_nonce_field('worknoon_chat_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th><?php _e('Enable Chat', 'worknoon-chat'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="enable_chat" <?php checked(!empty($settings['enable_chat'])); ?>>
                                <?php _e('Enable chat widget on frontend', 'worknoon-chat'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th><?php _e('Guest Chat', 'worknoon-chat'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="allow_guest_chat" <?php checked(!empty($settings['allow_guest_chat'])); ?>>
                                <?php _e('Allow guest users to start chat', 'worknoon-chat'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th><?php _e('Email Notifications', 'worknoon-chat'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="email_notifications" <?php checked(!empty($settings['email_notifications'])); ?>>
                                <?php _e('Send email notifications for new messages', 'worknoon-chat'); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th><?php _e('Primary Color', 'worknoon-chat'); ?></th>
                        <td>
                            <input type="color" name="primary_color" value="<?php echo esc_attr($settings['primary_color'] ?? '#4f46e5'); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th><?php _e('Widget Position', 'worknoon-chat'); ?></th>
                        <td>
                            <select name="position">
                                <option value="bottom-right" <?php selected($settings['position'] ?? '', 'bottom-right'); ?>><?php _e('Bottom Right', 'worknoon-chat'); ?></option>
                                <option value="bottom-left" <?php selected($settings['position'] ?? '', 'bottom-left'); ?>><?php _e('Bottom Left', 'worknoon-chat'); ?></option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th><?php _e('External API Endpoint', 'worknoon-chat'); ?></th>
                        <td>
                            <input type="url" name="api_endpoint" value="<?php echo esc_attr($settings['api_endpoint'] ?? ''); ?>" class="regular-text">
                            <p class="description"><?php _e('Optional: Connect to external Node.js chat server', 'worknoon-chat'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(__('Save Settings', 'worknoon-chat'), 'primary', 'save_worknoon_settings'); ?>
            </form>
        </div>
        <?php
    }

    /**
     * Render chat widget shortcode
     */
    public function render_chat_widget($atts) {
        $atts = shortcode_atts(array(
            'session_id' => 0,
        ), $atts);

        ob_start();
        ?>
        <div id="worknoon-chat-widget" class="worknoon-chat-widget" data-session-id="<?php echo esc_attr($atts['session_id']); ?>">
            <div class="chat-widget-container">
                <div class="chat-header">
                    <h3><?php _e('Chat Support', 'worknoon-chat'); ?></h3>
                    <button class="chat-toggle"><?php _e('Close', 'worknoon-chat'); ?></button>
                </div>
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-input">
                    <textarea id="chat-message-input" placeholder="<?php _e('Type your message...', 'worknoon-chat'); ?>"></textarea>
                    <button id="chat-send-btn"><?php _e('Send', 'worknoon-chat'); ?></button>
                </div>
            </div>
            <button class="chat-fab"><?php _e('Chat', 'worknoon-chat'); ?></button>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Render chat button shortcode
     */
    public function render_chat_button($atts) {
        $atts = shortcode_atts(array(
            'text' => __('Start Chat', 'worknoon-chat'),
            'agent_id' => 0,
        ), $atts);

        return '<button class="worknoon-chat-btn" data-agent-id="' . esc_attr($atts['agent_id']) . '">' . esc_html($atts['text']) . '</button>';
    }

    /**
     * AJAX: Send message
     */
    public function ajax_send_message() {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');

        $session_id = intval($_POST['session_id']);
        $content = sanitize_textarea_field($_POST['content']);
        $user_id = get_current_user_id();

        if (!$user_id) {
            wp_send_json_error('User not logged in');
        }

        $message = array(
            'id'            => uniqid('msg_'),
            'sender_id'     => $user_id,
            'sender_name'   => $this->get_user_display_name($user_id),
            'content'       => $content,
            'timestamp'     => current_time('mysql'),
        );

        $messages = get_post_meta($session_id, '_chat_messages', true);
        if (!is_array($messages)) {
            $messages = array();
        }

        $messages[] = $message;
        update_post_meta($session_id, '_chat_messages', $messages);

        wp_send_json_success($message);
    }

    /**
     * AJAX: Send message (non-logged in users)
     */
    public function ajax_nopriv_send_message() {
        wp_send_json_error('Please log in to send messages');
    }

    /**
     * AJAX: Get messages
     */
    public function ajax_get_messages() {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');

        $session_id = intval($_POST['session_id']);
        $messages = get_post_meta($session_id, '_chat_messages', true);

        if (!is_array($messages)) {
            $messages = array();
        }

        wp_send_json_success($messages);
    }

    /**
     * AJAX: Get messages (non-logged in users)
     */
    public function ajax_nopriv_get_messages() {
        wp_send_json_error('Please log in to view messages');
    }

    /**
     * Add chat to WooCommerce order page
     */
    public function add_chat_to_order_page($order) {
        $order_id = $order->get_id();
        $session_id = $this->get_or_create_order_chat_session($order_id);

        echo '<h2>' . __('Order Chat', 'worknoon-chat') . '</h2>';
        echo do_shortcode('[worknoon_chat session_id="' . $session_id . '"]');
    }

    /**
     * Add chat to WooCommerce product page
     */
    public function add_chat_to_product_page() {
        global $product;

        if (!$product) {
            return;
        }

        $product_id = $product->get_id();
        echo '<div class="product-chat-section">';
        echo '<h3>' . __('Questions about this product?', 'worknoon-chat') . '</h3>';
        echo do_shortcode('[worknoon_chat_button text="' . __('Chat with us', 'worknoon-chat') . '"]');
        echo '</div>';
    }

    /**
     * Get or create chat session for order
     */
    private function get_or_create_order_chat_session($order_id) {
        $session_id = get_post_meta($order_id, '_chat_session_id', true);

        if ($session_id) {
            return $session_id;
        }

        $order = wc_get_order($order_id);
        $user_id = $order->get_user_id();

        $session_data = array(
            'post_title'    => sprintf(__('Order #%d Chat', 'worknoon-chat'), $order_id),
            'post_type'     => 'chat_session',
            'post_status'   => 'publish',
            'post_author'   => $user_id ?: 1,
        );

        $session_id = wp_insert_post($session_data);

        if (!is_wp_error($session_id)) {
            update_post_meta($session_id, '_chat_participants', array($user_id));
            update_post_meta($session_id, '_chat_status', 'active');
            update_post_meta($session_id, '_chat_type', 'order');
            update_post_meta($session_id, '_wc_order_id', $order_id);
            update_post_meta($order_id, '_chat_session_id', $session_id);
        }

        return $session_id;
    }

    /**
     * Plugin activation
     */
    public function activate() {
        $this->register_chat_session_post_type();
        flush_rewrite_rules();

        // Create default settings
        $default_settings = array(
            'enable_chat'       => true,
            'allow_guest_chat'  => false,
            'email_notifications'=> true,
            'primary_color'     => '#4f46e5',
            'position'          => 'bottom-right',
        );

        add_option('worknoon_chat_settings', $default_settings);
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        flush_rewrite_rules();
    }
}

// Initialize plugin
Worknoon_Chat::get_instance();
