<?php
/**
 * Plugin Name: Worknoon Chat
 * Plugin URI: https://worknoon.com
 * Description: Real-time chat integration for eCommerce platforms. Connects to Worknoon Chat Node.js backend using Master Token authentication.
 * Version: 2.0.0
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

if (version_compare(PHP_VERSION, '7.4', '<')) {
    add_action('admin_notices', function () {
        echo '<div class="error"><p><strong>Worknoon Chat:</strong> Requires PHP 7.4 or higher. Your current PHP version is ' . PHP_VERSION . '</p></div>';
    });
    return;
}

define('WORKNOON_CHAT_VERSION', '1.0.0');
define('WORKNOON_CHAT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('WORKNOON_CHAT_PLUGIN_URL', plugin_dir_url(__FILE__));

class Worknoon_Chat
{
    private static $instance = null;
    private $api_base_url = '';

    public static function get_instance()
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct()
    {
        $this->init();
    }

    private function init()
    {
        $settings = get_option('worknoon_chat_settings', array());
        $this->api_base_url = rtrim($settings['api_endpoint'] ?? 'http://localhost:5001/api', '/');

        add_action('init', array($this, 'register_chat_session_post_type'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_scripts'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));

        add_shortcode('worknoon_chat', array($this, 'render_chat_widget'));
        add_shortcode('worknoon_chat_button', array($this, 'render_chat_button'));

        add_action('wp_ajax_worknoon_chat_proxy', array($this, 'ajax_proxy_to_backend'));
        add_action('wp_ajax_nopriv_worknoon_chat_proxy', array($this, 'ajax_nopriv_proxy'));
        add_action('wp_ajax_worknoon_chat_upload', array($this, 'ajax_handle_file_upload'));
        add_action('wp_ajax_nopriv_worknoon_chat_upload', array($this, 'ajax_handle_file_upload'));
        add_action('wp_ajax_worknoon_test_connection', array($this, 'ajax_test_connection'));
        add_action('wp_ajax_worknoon_test_master_token', array($this, 'ajax_test_master_token'));
        add_action('wp_ajax_worknoon_sync_users', array($this, 'ajax_sync_users'));

        add_action('user_register', array($this, 'sync_user_to_backend'), 10, 1);
        add_action('profile_update', array($this, 'sync_user_to_backend'), 10, 1);
        add_action('wp_login', array($this, 'authenticate_with_backend'), 10, 2);

        if (class_exists('WooCommerce')) {
            add_action('woocommerce_order_details_after_order_table', array($this, 'add_chat_to_order_page'));
            add_action('woocommerce_single_product_summary', array($this, 'add_chat_to_product_page'), 35);
        }

        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }

    // ─── Master Token Helpers ───────────────────────────────────────────────

    /**
     * Get the master token from settings (used for all admin external API calls)
     */
    private function get_master_token()
    {
        $settings = get_option('worknoon_chat_settings', array());
        return $settings['master_token'] ?? $settings['master_api_key'] ?? '';
    }

    /**
     * Make an authenticated external API request using the master token.
     * Uses the /api/external/* endpoints designed for WordPress.
     */
    private function external_api_request($endpoint, $method = 'GET', $data = null)
    {
        $token = $this->get_master_token();
        if (empty($token)) {
            return new WP_Error('no_token', 'Master token not configured. Go to Settings to add your token.');
        }

        $url = $this->api_base_url . '/external' . $endpoint;
        $args = array(
            'method' => $method,
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'Authorization' => 'Bearer ' . $token,
            ),
        );

        if ($data && in_array($method, array('POST', 'PUT', 'PATCH'))) {
            $args['body'] = json_encode($data);
        }

        return wp_remote_request($url, $args);
    }

    // ─── Chat Session Post Type ────────────────────────────────────────────

    public function register_chat_session_post_type()
    {
        register_post_type('chat_session', array(
            'labels' => array(
                'name' => __('Chat Sessions', 'worknoon-chat'),
                'singular_name' => __('Chat Session', 'worknoon-chat'),
                'menu_name' => __('Chat Sessions', 'worknoon-chat'),
                'add_new' => __('Add New', 'worknoon-chat'),
                'add_new_item' => __('Add New Chat Session', 'worknoon-chat'),
                'edit_item' => __('Edit Chat Session', 'worknoon-chat'),
                'new_item' => __('New Chat Session', 'worknoon-chat'),
                'view_item' => __('View Chat Session', 'worknoon-chat'),
                'search_items' => __('Search Chat Sessions', 'worknoon-chat'),
                'not_found' => __('No chat sessions found', 'worknoon-chat'),
                'not_found_in_trash' => __('No chat sessions found in trash', 'worknoon-chat'),
            ),
            'public' => false,
            'publicly_queryable' => false,
            'show_ui' => true,
            'show_in_menu' => true,
            'capability_type' => 'post',
            'has_archive' => false,
            'hierarchical' => false,
            'menu_position' => 30,
            'menu_icon' => 'dashicons-format-chat',
            'supports' => array('title', 'author', 'custom-fields'),
        ));
    }

    // ─── Admin Menu ────────────────────────────────────────────────────────

    public function add_admin_menu()
    {
        add_menu_page(
            __('Worknoon Chat', 'worknoon-chat'),
            __('Worknoon Chat', 'worknoon-chat'),
            'manage_options',
            'worknoon-chat-dashboard',
            array($this, 'render_admin_dashboard'),
            'dashicons-format-chat',
            30
        );

        add_submenu_page('worknoon-chat-dashboard', __('All Conversations', 'worknoon-chat'), __('All Conversations', 'worknoon-chat'), 'manage_options', 'worknoon-chat-conversations', array($this, 'render_conversations_page'));
        add_submenu_page('worknoon-chat-dashboard', __('Chat Sessions', 'worknoon-chat'), __('Chat Sessions', 'worknoon-chat'), 'manage_options', 'edit.php?post_type=chat_session');
        add_submenu_page('worknoon-chat-dashboard', __('Chat Users', 'worknoon-chat'), __('Chat Users', 'worknoon-chat'), 'manage_options', 'worknoon-chat-users', array($this, 'render_users_page'));
        add_submenu_page('worknoon-chat-dashboard', __('Analytics', 'worknoon-chat'), __('Analytics', 'worknoon-chat'), 'manage_options', 'worknoon-chat-analytics', array($this, 'render_analytics_page'));
        add_submenu_page('worknoon-chat-dashboard', __('Settings', 'worknoon-chat'), __('Settings', 'worknoon-chat'), 'manage_options', 'worknoon-chat-settings', array($this, 'render_settings_page'));
    }

    // ─── HTTP Helpers ──────────────────────────────────────────────────────

    private function make_backend_request($endpoint, $method = 'GET', $data = null, $auth_token = null)
    {
        $url = $this->api_base_url . $endpoint;
        $args = array(
            'method' => $method,
            'timeout' => 30,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ),
        );

        if ($auth_token) {
            $args['headers']['Authorization'] = 'Bearer ' . $auth_token;
        }

        if ($data && in_array($method, array('POST', 'PUT', 'PATCH'))) {
            $args['body'] = json_encode($data);
        }

        return wp_remote_request($url, $args);
    }

    private function find_backend_user_by_email($email)
    {
        $args = array(
            'method' => 'GET',
            'timeout' => 30,
            'headers' => array('Content-Type' => 'application/json'),
        );

        $token = $this->get_master_token();
        if (!empty($token)) {
            $args['headers']['Authorization'] = 'Bearer ' . $token;
        } else {
            // No master token available, can't make this request
            return null;
        }

        // Use the external API endpoint that supports master token authentication
        $response = wp_remote_request($this->api_base_url . '/external/users', $args);
        if (is_wp_error($response)) return null;

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) return null;

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($body)) return null;

        // Handle paginated response format from external API
        $data = $body['data'] ?? $body;
        if (isset($data['users']) && is_array($data['users'])) {
            $users = $data['users'];
        } elseif (is_array($data)) {
            $users = $data;
        } else {
            return null;
        }

        foreach ($users as $bu) {
            if (!is_array($bu) || empty($bu['email'])) continue;
            if (strcasecmp($bu['email'], $email) === 0) return $bu;
        }
        return null;
    }

    // ─── User Sync ─────────────────────────────────────────────────────────

    public function sync_user_to_backend($user_id)
    {
        $user = get_userdata($user_id);
        if (!$user) return;

        // Check if already synced with backend ID
        $existing_backend_id = get_user_meta($user_id, '_worknoon_backend_id', true);
        if ($existing_backend_id) {
            // Already synced, just refresh tokens
            $this->refresh_user_tokens($user_id);
            return;
        }

        $temp_password = get_user_meta($user_id, '_worknoon_temp_password', true);
        $backend_role = $this->map_wordpress_role($user->roles[0] ?? 'customer');

        if (empty($temp_password)) {
            $temp_password = wp_generate_password(20, true, true);
            update_user_meta($user_id, '_worknoon_temp_password', $temp_password);
        }

        // Step 1: Check if user already exists in backend by email
        $backend_user = $this->find_backend_user_by_email($user->user_email);
        if ($backend_user && !empty($backend_user['_id'])) {
            // User exists in backend, store the ID
            update_user_meta($user_id, '_worknoon_backend_id', $backend_user['_id']);

            // Try to login with temp password
            $login_response = $this->make_backend_request('/auth/login', 'POST', array(
                'email' => $user->user_email,
                'password' => $temp_password,
            ));

            if (!is_wp_error($login_response)) {
                $login_code = wp_remote_retrieve_response_code($login_response);
                $login_body = json_decode(wp_remote_retrieve_body($login_response), true);
                $data = $login_body['data'] ?? $login_body;

                if ($login_code === 200 && !empty($data['tokens']['accessToken'])) {
                    // Login successful, store tokens
                    update_user_meta($user_id, '_worknoon_jwt_token', $data['tokens']['accessToken']);
                    update_user_meta($user_id, '_worknoon_refresh_token', $data['tokens']['refreshToken']);
                    delete_user_meta($user_id, '_worknoon_needs_password_reset');
                    return;
                }
            }

            // Login failed - user exists but password is wrong
            // Mark for password reset on next login
            update_user_meta($user_id, '_worknoon_needs_password_reset', true);
            return;
        }

        // Step 2: User doesn't exist, try to register
        $user_data = array(
            'email' => $user->user_email,
            'name' => $user->display_name,
            'role' => $backend_role,
            'wordpress_id' => $user_id,
            'password' => $temp_password,
        );

        $response = $this->make_backend_request('/auth/register', 'POST', $user_data);
        $status_code = wp_remote_retrieve_response_code($response);

        if (!is_wp_error($response) && $status_code >= 200 && $status_code < 300) {
            // Registration successful
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $rd = $body['data'] ?? $body;
            if (!empty($rd['user']['_id'])) {
                update_user_meta($user_id, '_worknoon_backend_id', $rd['user']['_id']);
            }
            if (!empty($rd['tokens']['accessToken'])) {
                update_user_meta($user_id, '_worknoon_jwt_token', $rd['tokens']['accessToken']);
                update_user_meta($user_id, '_worknoon_refresh_token', $rd['tokens']['refreshToken']);
                delete_user_meta($user_id, '_worknoon_needs_password_reset');
            }
        } elseif ($status_code === 409) {
            // User was created between our check and registration attempt
            // Try to find them again
            $backend_user = $this->find_backend_user_by_email($user->user_email);
            if ($backend_user && !empty($backend_user['_id'])) {
                update_user_meta($user_id, '_worknoon_backend_id', $backend_user['_id']);
                update_user_meta($user_id, '_worknoon_needs_password_reset', true);
            }
        }
    }

    private function refresh_user_tokens($user_id)
    {
        $refresh_token = get_user_meta($user_id, '_worknoon_refresh_token', true);
        if (empty($refresh_token)) return;

        $response = $this->make_backend_request('/auth/refresh', 'POST', array('refreshToken' => $refresh_token));
        if (is_wp_error($response)) return;

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) return;

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $data = $body['data'] ?? $body;

        if (!empty($data['accessToken'])) {
            update_user_meta($user_id, '_worknoon_jwt_token', $data['accessToken']);
            if (!empty($data['refreshToken'])) {
                update_user_meta($user_id, '_worknoon_refresh_token', $data['refreshToken']);
            }
        }
    }

    public function authenticate_with_backend($user_login, $user)
    {
        $this->sync_user_to_backend($user->ID);
    }

    private function map_wordpress_role($wp_role)
    {
        $mapping = array(
            'administrator' => 'admin',
            'shop_manager' => 'agent',
            'customer' => 'customer',
            'subscriber' => 'customer',
            'contributor' => 'designer',
            'author' => 'merchant',
        );
        return $mapping[$wp_role] ?? 'customer';
    }

    // ─── AJAX ──────────────────────────────────────────────────────────────

    public function ajax_proxy_to_backend()
    {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');

        $endpoint = sanitize_text_field($_POST['endpoint'] ?? '');
        $method = sanitize_text_field($_POST['method'] ?? 'GET');
        $data = isset($_POST['data']) ? json_decode(stripslashes($_POST['data']), true) : array();
        $token = isset($_POST['token']) ? sanitize_text_field($_POST['token']) : '';

        $jwt_token = $token;
        $user_id = get_current_user_id();

        // Try to get user's JWT token
        if (empty($jwt_token) && $user_id) {
            $jwt_token = get_user_meta($user_id, '_worknoon_jwt_token', true);

            // If no token, try to sync/authenticate the user
            if (empty($jwt_token)) {
                error_log('Worknoon Chat: No JWT token found for user ' . $user_id . ', attempting sync...');
                $this->sync_user_to_backend($user_id);
                $jwt_token = get_user_meta($user_id, '_worknoon_jwt_token', true);
            }
        }

        // If still no token, try using master token for admin endpoints
        if (empty($jwt_token) && current_user_can('manage_options')) {
            $master_token = $this->get_master_token();
            if (!empty($master_token)) {
                error_log('Worknoon Chat: Using master token as fallback for admin user');

                // Check if endpoint is already an external endpoint
                if (strpos($endpoint, '/external/') === 0) {
                    // Already an external endpoint, strip the /external prefix since external_api_request adds it
                    $external_endpoint = substr($endpoint, strlen('/external'));
                } else {
                    // Convert to external endpoint
                    $external_endpoint = str_replace('/conversations/', '/conversations/', $endpoint);
                    $external_endpoint = str_replace('/messages/', '/messages/', $external_endpoint);
                    $external_endpoint = str_replace('/users', '/users', $external_endpoint);
                }

                error_log('Worknoon Chat: Calling external endpoint: ' . $external_endpoint);

                // Call external API endpoint with master token
                $response = $this->external_api_request($external_endpoint, $method, $data);
                if (!is_wp_error($response)) {
                    $body = wp_remote_retrieve_body($response);
                    $status_code = wp_remote_retrieve_response_code($response);
                    error_log('Worknoon Chat: External API response status: ' . $status_code);
                    $backend_data = json_decode($body, true);
                    if (isset($backend_data['success']) && $backend_data['success']) {
                        wp_send_json_success($backend_data['data'] ?? $backend_data);
                        return;
                    } else {
                        error_log('Worknoon Chat: External API error: ' . ($backend_data['message'] ?? 'Unknown error'));
                        wp_send_json_error($backend_data['message'] ?? 'External API request failed');
                        return;
                    }
                } else {
                    error_log('Worknoon Chat: External API request failed: ' . $response->get_error_message());
                }
            }
        }

        if (empty($jwt_token)) {
            error_log('Worknoon Chat: Authentication failed - no JWT token available');
            wp_send_json_error('Authentication required. Please log out and log back in to sync your account.');
            return;
        }

        $response = $this->make_backend_request($endpoint, $method, $data, $jwt_token);
        if (is_wp_error($response)) {
            wp_send_json_error($response->get_error_message());
        }

        $body = wp_remote_retrieve_body($response);
        $status_code = wp_remote_retrieve_response_code($response);
        error_log('Worknoon Chat: Backend response status: ' . $status_code . ' for endpoint: ' . $endpoint);

        if ($status_code === 401) {
            error_log('Worknoon Chat: Token expired, attempting refresh...');
            $refresh_token = get_user_meta($user_id, '_worknoon_refresh_token', true);
            if ($refresh_token) {
                $refresh_response = $this->make_backend_request('/auth/refresh', 'POST', array('refreshToken' => $refresh_token));
                if (!is_wp_error($refresh_response)) {
                    $rb = json_decode(wp_remote_retrieve_body($refresh_response), true);
                    if (!empty($rb['data']['accessToken'])) {
                        update_user_meta($user_id, '_worknoon_jwt_token', $rb['data']['accessToken']);
                        $response = $this->make_backend_request($endpoint, $method, $data, $rb['data']['accessToken']);
                        $body = wp_remote_retrieve_body($response);
                    } else {
                        // Refresh failed, clear tokens
                        delete_user_meta($user_id, '_worknoon_jwt_token');
                        delete_user_meta($user_id, '_worknoon_refresh_token');
                        wp_send_json_error('Session expired. Please refresh the page.');
                        return;
                    }
                }
            } else {
                wp_send_json_error('Session expired. Please log out and log back in.');
                return;
            }
        }

        $backend_data = json_decode($body, true);
        if (isset($backend_data['success']) && $backend_data['success'] && isset($backend_data['data'])) {
            wp_send_json_success($backend_data['data']);
        } else {
            wp_send_json_success($backend_data);
        }
    }

    public function ajax_nopriv_proxy()
    {
        $settings = get_option('worknoon_chat_settings', array());
        if (empty($settings['allow_guest_chat'])) {
            wp_send_json_error('Guest chat not enabled');
        }

        $endpoint = sanitize_text_field($_POST['endpoint'] ?? '');
        if (!in_array($endpoint, array('/auth/register', '/auth/login'))) {
            wp_send_json_error('Unauthorized');
        }

        $method = sanitize_text_field($_POST['method'] ?? 'POST');
        $data = isset($_POST['data']) ? json_decode(stripslashes($_POST['data']), true) : array();

        $response = $this->make_backend_request($endpoint, $method, $data);
        if (is_wp_error($response)) {
            wp_send_json_error($response->get_error_message());
        }

        $body = wp_remote_retrieve_body($response);
        wp_send_json_success(json_decode($body, true));
    }

    // ─── Scripts ───────────────────────────────────────────────────────────

    public function enqueue_frontend_scripts()
    {
        $settings = get_option('worknoon_chat_settings', array());
        if (empty($settings['enable_chat']) || function_exists('worknoon_chat_storefront_enqueue_styles')) return;

        wp_enqueue_script('socket-io', 'https://cdn.socket.io/4.7.2/socket.io.min.js', array(), '4.7.2', true);
        wp_enqueue_style('worknoon-chat-style', WORKNOON_CHAT_PLUGIN_URL . 'assets/css/chat-widget.css', array(), WORKNOON_CHAT_VERSION);
        wp_enqueue_script('worknoon-chat-script', WORKNOON_CHAT_PLUGIN_URL . 'assets/js/chat-widget.js', array('jquery', 'socket-io'), WORKNOON_CHAT_VERSION, true);

        $user_id = get_current_user_id();
        wp_localize_script('worknoon-chat-script', 'worknoonChat', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'apiUrl' => $this->api_base_url,
            'nonce' => wp_create_nonce('worknoon_chat_nonce'),
            'userId' => $user_id,
            'backendUserId' => get_user_meta($user_id, '_worknoon_backend_id', true),
            'userName' => $user_id ? wp_get_current_user()->display_name : 'Guest',
            'userEmail' => $user_id ? wp_get_current_user()->user_email : '',
            'isLoggedIn' => is_user_logged_in(),
            'jwtToken' => get_user_meta($user_id, '_worknoon_jwt_token', true),
            'socketUrl' => $settings['socket_endpoint'] ?? 'http://localhost:5001',
            'loginUrl' => wp_login_url(),
            'settings' => array(
                'allowGuestChat' => !empty($settings['allow_guest_chat']),
                'primaryColor' => $settings['primary_color'] ?? '#4f46e5',
                'position' => $settings['position'] ?? 'bottom-right',
            ),
        ));
    }

    public function enqueue_admin_scripts($hook)
    {
        $worknoon_pages = array(
            'toplevel_page_worknoon-chat-dashboard', 'worknoon-chat_page_worknoon-chat-conversations',
            'worknoon-chat_page_worknoon-chat-users', 'worknoon-chat_page_worknoon-chat-analytics',
            'worknoon-chat_page_worknoon-chat-settings', 'edit.php', 'post.php', 'post-new.php'
        );

        $screen = get_current_screen();
        if (!in_array($hook, $worknoon_pages, true) && !($screen && $screen->post_type === 'chat_session')) return;

        wp_enqueue_script('socket-io', 'https://cdn.socket.io/4.7.2/socket.io.min.js', array(), '4.7.2', true);
        wp_enqueue_style('worknoon-chat-admin-style', WORKNOON_CHAT_PLUGIN_URL . 'assets/css/admin.css', array(), WORKNOON_CHAT_VERSION);
        wp_enqueue_script('worknoon-chat-admin-script', WORKNOON_CHAT_PLUGIN_URL . 'assets/js/admin.js', array('jquery', 'socket-io'), WORKNOON_CHAT_VERSION, true);

        $settings = get_option('worknoon_chat_settings', array());
        $user_id = get_current_user_id();
        wp_localize_script('worknoon-chat-admin-script', 'worknoonChatAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('worknoon_chat_nonce'),
            'socketUrl' => $settings['socket_endpoint'] ?? 'http://localhost:5001',
            'jwtToken' => get_user_meta($user_id, '_worknoon_jwt_token', true),
            'backendUserId' => get_user_meta($user_id, '_worknoon_backend_id', true),
            'userName' => $user_id ? wp_get_current_user()->display_name : '',
            'userEmail' => $user_id ? wp_get_current_user()->user_email : '',
            'masterToken' => $this->get_master_token(),
        ));
    }

    // ─── Render: Dashboard ─────────────────────────────────────────────────

    public function render_admin_dashboard()
    {
        $this->ensure_admin_authenticated();

        // Fetch real data from backend
        $conversations = $this->fetch_all_conversations();
        $users = $this->fetch_all_users();

        // Calculate real statistics
        $total_conversations = count($conversations);
        $unread_messages = 0;
        $online_users = 0;
        $recent_conversations = array_slice($conversations, 0, 5);

        foreach ($conversations as $conv) {
            $unread_messages += $conv['unreadCount'] ?? 0;
        }

        foreach ($users as $user) {
            if (!empty($user['status']['isOnline'])) {
                $online_users++;
            }
        }

        // Get today's active users count
        $today = date('Y-m-d');
        $active_today = 0;
        foreach ($conversations as $conv) {
            $updated = $conv['updatedAt'] ?? '';
            if (strpos($updated, $today) === 0) {
                $active_today++;
            }
        }
        ?>
        <div class="wrap worknoon-admin-dashboard">
            <h1><?php _e('Worknoon Chat Dashboard', 'worknoon-chat'); ?></h1>

            <!-- Real Statistics Cards -->
            <div class="worknoon-stats-grid">
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">💬</div>
                    <div class="worknoon-stat-content">
                        <h3 id="dashboard-total-conversations"><?php echo number_format($total_conversations); ?></h3>
                        <p><?php _e('Total Conversations', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">📩</div>
                    <div class="worknoon-stat-content">
                        <h3 id="dashboard-unread-messages"><?php echo number_format($unread_messages); ?></h3>
                        <p><?php _e('Unread Messages', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">👥</div>
                    <div class="worknoon-stat-content">
                        <h3 id="dashboard-online-users"><?php echo number_format($online_users); ?></h3>
                        <p><?php _e('Users Online', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">🔄</div>
                    <div class="worknoon-stat-content">
                        <h3 id="dashboard-active-today"><?php echo number_format($active_today); ?></h3>
                        <p><?php _e('Active Today', 'worknoon-chat'); ?></p>
                    </div>
                </div>
            </div>

            <div class="worknoon-dashboard-grid">
                <div class="worknoon-dashboard-main">
                    <!-- Recent Conversations with Real Data -->
                    <div class="worknoon-card">
                        <h2><?php _e('Recent Conversations', 'worknoon-chat'); ?>
                            <span style="font-size: 12px; color: #666; font-weight: normal;">(<?php echo count($recent_conversations); ?> shown)</span>
                        </h2>
                        <div id="worknoon-recent-conversations" class="worknoon-conversations-list">
                            <?php if (empty($recent_conversations)): ?>
                                <p class="worknoon-no-data">No conversations yet.</p>
                            <?php else: ?>
                                <?php foreach ($recent_conversations as $conv):
                                    $other = $this->get_conversation_other_participant($conv);
                                    $lastMsg = $conv['lastMessage'] ?? [];
                                    $isUnread = ($conv['unreadCount'] ?? 0) > 0;
                                    $time = $this->format_time_ago($lastMsg['createdAt'] ?? $conv['updatedAt'] ?? '');
                                ?>
                                <div class="worknoon-recent-conversation <?php echo $isUnread ? 'unread' : ''; ?>"
                                     onclick="window.location.href='<?php echo admin_url('admin.php?page=worknoon-chat-conversations'); ?>'">
                                    <div class="worknoon-recent-conv-info">
                                        <strong><?php echo esc_html($other['name'] ?? 'Unknown'); ?></strong>
                                        <span class="worknoon-recent-time"><?php echo esc_html($time); ?></span>
                                    </div>
                                    <div class="worknoon-recent-preview">
                                        <?php echo esc_html(substr($lastMsg['content'] ?? 'No messages', 0, 50)) . (strlen($lastMsg['content'] ?? '') > 50 ? '...' : ''); ?>
                                    </div>
                                    <?php if ($isUnread): ?>
                                        <span class="worknoon-unread-badge"><?php echo intval($conv['unreadCount']); ?></span>
                                    <?php endif; ?>
                                </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                        <p class="worknoon-view-all">
                            <a href="<?php echo admin_url('admin.php?page=worknoon-chat-conversations'); ?>" class="button">
                                <?php _e('View All Conversations', 'worknoon-chat'); ?>
                            </a>
                        </p>
                    </div>
                </div>

                <div class="worknoon-dashboard-sidebar">
                    <!-- Quick Actions -->
                    <div class="worknoon-card">
                        <h2><?php _e('Quick Actions', 'worknoon-chat'); ?></h2>
                        <div class="worknoon-quick-actions">
                            <a href="<?php echo admin_url('admin.php?page=worknoon-chat-conversations'); ?>" class="button button-primary">
                                <?php _e('Open Chat Inbox', 'worknoon-chat'); ?>
                            </a>
                            <a href="<?php echo admin_url('admin.php?page=worknoon-chat-users'); ?>" class="button">
                                <?php _e('Manage Users', 'worknoon-chat'); ?> (<?php echo count($users); ?>)
                            </a>
                            <a href="<?php echo admin_url('admin.php?page=worknoon-chat-settings'); ?>" class="button">
                                <?php _e('Settings', 'worknoon-chat'); ?>
                            </a>
                        </div>
                    </div>

                    <!-- System Status -->
                    <div class="worknoon-card">
                        <h2><?php _e('System Status', 'worknoon-chat'); ?></h2>
                        <div class="worknoon-status-list">
                            <div class="worknoon-status-item">
                                <span class="worknoon-status-label"><?php _e('Backend API:', 'worknoon-chat'); ?></span>
                                <span id="worknoon-api-status" class="worknoon-status-badge worknoon-status-checking">
                                    <?php _e('Checking...', 'worknoon-chat'); ?>
                                </span>
                            </div>
                            <div class="worknoon-status-item">
                                <span class="worknoon-status-label"><?php _e('WebSocket:', 'worknoon-chat'); ?></span>
                                <span id="worknoon-socket-status" class="worknoon-status-badge worknoon-status-checking">
                                    <?php _e('Checking...', 'worknoon-chat'); ?>
                                </span>
                            </div>
                            <div class="worknoon-status-item">
                                <span class="worknoon-status-label"><?php _e('Master Token:', 'worknoon-chat'); ?></span>
                                <span id="worknoon-master-token-status" class="worknoon-status-badge worknoon-status-checking">
                                    <?php _e('Checking...', 'worknoon-chat'); ?>
                                </span>
                            </div>
                            <div class="worknoon-status-item">
                                <span class="worknoon-status-label"><?php _e('Last Updated:', 'worknoon-chat'); ?></span>
                                <span class="worknoon-status-value"><?php echo date('Y-m-d H:i:s'); ?></span>
                            </div>
                        </div>
                        <button type="button" class="button" id="worknoon-refresh-status">
                            <?php _e('Refresh Status', 'worknoon-chat'); ?>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    private function ensure_admin_authenticated()
    {
        $user_id = get_current_user_id();
        if (!$user_id) return;

        $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
        $bid = get_user_meta($user_id, '_worknoon_backend_id', true);

        if (empty($jwt) || empty($bid)) {
            $this->sync_user_to_backend($user_id);
            $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
            if (empty($jwt)) {
                $user = get_userdata($user_id);
                if ($user) $this->authenticate_with_backend($user->user_login, $user);
            }
        }
    }

    /**
     * Fetch all conversations from backend using master token
     */
    private function fetch_all_conversations()
    {
        // Try master token first
        $master_token = $this->get_master_token();
        if (!empty($master_token)) {
            $response = $this->external_api_request('/conversations', 'GET');
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                if (isset($body['success']) && $body['success'] === true) {
                    $data = $body['data'] ?? [];
                    // Handle paginated response
                    if (isset($data['data']) && is_array($data['data'])) {
                        return $data['data'];
                    }
                    if (is_array($data)) {
                        return $data;
                    }
                }
            }
        }

        // Fallback to user JWT
        $user_id = get_current_user_id();
        $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
        if (!empty($jwt)) {
            $response = $this->make_backend_request('/conversations', 'GET', null, $jwt);
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                $data = $body['data'] ?? [];
                if (isset($data['conversations']) && is_array($data['conversations'])) {
                    return $data['conversations'];
                }
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        return [];
    }

    /**
     * Fetch all users from backend using master token
     */
    private function fetch_all_users()
    {
        // Try master token first
        $master_token = $this->get_master_token();
        if (!empty($master_token)) {
            $response = $this->external_api_request('/users', 'GET');
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                if (isset($body['success']) && $body['success'] === true) {
                    $data = $body['data'] ?? [];
                    // Handle paginated response
                    if (isset($data['data']) && is_array($data['data'])) {
                        return $data['data'];
                    }
                    if (isset($data['users']) && is_array($data['users'])) {
                        return $data['users'];
                    }
                    if (is_array($data)) {
                        return $data;
                    }
                }
            }
        }

        // Fallback to user JWT
        $user_id = get_current_user_id();
        $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
        if (!empty($jwt)) {
            $response = $this->make_backend_request('/users', 'GET', null, $jwt);
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                $data = $body['data'] ?? [];
                if (isset($data['users']) && is_array($data['users'])) {
                    return $data['users'];
                }
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        return [];
    }

    /**
     * Get the other participant in a conversation (not the current admin)
     */
    private function get_conversation_other_participant($conversation)
    {
        $current_user_id = get_current_user_id();
        $backend_id = get_user_meta($current_user_id, '_worknoon_backend_id', true);

        if (empty($conversation['participants']) || !is_array($conversation['participants'])) {
            return ['name' => 'Unknown', 'email' => ''];
        }

        foreach ($conversation['participants'] as $participant) {
            $participant_id = null;
            if (isset($participant['userId'])) {
                if (is_array($participant['userId']) && isset($participant['userId']['_id'])) {
                    $participant_id = $participant['userId']['_id'];
                    $participant_name = $participant['userId']['name'] ??
                        (($participant['userId']['profile']['firstName'] ?? '') . ' ' . ($participant['userId']['profile']['lastName'] ?? ''));
                    $participant_email = $participant['userId']['email'] ?? '';
                } elseif (is_string($participant['userId'])) {
                    $participant_id = $participant['userId'];
                }
            }

            // Skip if this is the current user
            if ($participant_id && $participant_id === $backend_id) {
                continue;
            }

            // Return the other participant's info
            if (!empty($participant_name) || !empty($participant_email)) {
                return [
                    'name' => trim($participant_name) ?: 'Unknown',
                    'email' => $participant_email
                ];
            }
        }

        return ['name' => 'Unknown', 'email' => ''];
    }

    /**
     * Format a timestamp as "time ago"
     */
    private function format_time_ago($timestamp)
    {
        if (empty($timestamp)) return '';

        $time = strtotime($timestamp);
        if (!$time) return '';

        $now = time();
        $diff = $now - $time;

        if ($diff < 60) {
            return 'Just now';
        } elseif ($diff < 3600) {
            $mins = floor($diff / 60);
            return $mins . 'm ago';
        } elseif ($diff < 86400) {
            $hours = floor($diff / 3600);
            return $hours . 'h ago';
        } elseif ($diff < 604800) {
            $days = floor($diff / 86400);
            return $days . 'd ago';
        } else {
            return date('M j, Y', $time);
        }
    }

    private function get_chat_statistics()
    {
        // Try to use master token for admin statistics
        $master_token = $this->get_master_token();
        if (!empty($master_token)) {
            $response = $this->external_api_request('/conversations', 'GET');
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                if (isset($body['data']['data']) && is_array($body['data']['data'])) {
                    $conversations = $body['data']['data'];
                    $total = count($conversations);
                    $unread = 0;
                    foreach ($conversations as $conv) $unread += $conv['unreadCount'] ?? 0;
                    return array('total_conversations' => $total, 'unread_messages' => $unread, 'active_users' => 0, 'avg_response_time' => 'N/A');
                }
            }
        }

        // Fallback to user JWT token
        $user_id = get_current_user_id();
        $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
        if (empty($jwt)) return array();

        $response = $this->make_backend_request('/conversations', 'GET', null, $jwt);
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $conversations = $body['data'] ?? $body ?? array();
            if (isset($conversations['conversations'])) $conversations = $conversations['conversations'];

            $total = count($conversations);
            $unread = 0;
            foreach ($conversations as $conv) $unread += $conv['unreadCount'] ?? 0;

            return array('total_conversations' => $total, 'unread_messages' => $unread, 'active_users' => 0, 'avg_response_time' => 'N/A');
        }
        return array();
    }

    // ─── Render: Conversations ─────────────────────────────────────────────

    public function render_conversations_page()
    {
        $this->ensure_admin_authenticated();
        ?>
        <div class="wrap worknoon-admin-conversations">
            <h1><?php _e('All Conversations', 'worknoon-chat'); ?></h1>
            <div class="worknoon-conversations-toolbar">
                <div class="worknoon-filters">
                    <select id="worknoon-filter-status"><option value=""><?php _e('All Status', 'worknoon-chat'); ?></option><option value="active"><?php _e('Active', 'worknoon-chat'); ?></option><option value="closed"><?php _e('Closed', 'worknoon-chat'); ?></option><option value="pending"><?php _e('Pending', 'worknoon-chat'); ?></option></select>
                    <select id="worknoon-filter-type"><option value=""><?php _e('All Types', 'worknoon-chat'); ?></option><option value="buyer-agent"><?php _e('Support', 'worknoon-chat'); ?></option><option value="buyer-designer"><?php _e('Designer', 'worknoon-chat'); ?></option><option value="buyer-merchant"><?php _e('Merchant', 'worknoon-chat'); ?></option></select>
                    <input type="text" id="worknoon-search-conversations" placeholder="<?php _e('Search conversations...', 'worknoon-chat'); ?>">
                </div>
                <button type="button" class="button button-primary" id="worknoon-refresh-conversations"><?php _e('Refresh', 'worknoon-chat'); ?></button>
            </div>
            <div class="worknoon-conversations-layout">
                <div class="worknoon-conversations-list-panel"><div id="worknoon-all-conversations" class="worknoon-conversations-list-full"><p class="worknoon-loading"><?php _e('Loading conversations...', 'worknoon-chat'); ?></p></div></div>
                <div class="worknoon-chat-panel" id="worknoon-admin-chat-panel" style="display:none;">
                    <div class="worknoon-chat-header"><h3 id="worknoon-chat-participant-name"><?php _e('Select a conversation', 'worknoon-chat'); ?></h3><span id="worknoon-chat-status" class="worknoon-status-badge"></span></div>
                    <div id="worknoon-admin-chat-messages" class="worknoon-admin-chat-messages"><p class="worknoon-select-conversation"><?php _e('Select a conversation to view messages', 'worknoon-chat'); ?></p></div>
                    <div class="worknoon-chat-input-area"><textarea id="worknoon-admin-message-input" rows="3" placeholder="<?php _e('Type your message...', 'worknoon-chat'); ?>"></textarea><div class="worknoon-chat-actions"><button type="button" class="button" id="worknoon-admin-attach-btn"><?php _e('Attach File', 'worknoon-chat'); ?></button><button type="button" class="button button-primary" id="worknoon-admin-send-btn"><?php _e('Send', 'worknoon-chat'); ?></button></div></div>
                    <input type="hidden" id="worknoon-current-conversation-id">
                </div>
            </div>
            <input type="hidden" id="worknoon-admin-nonce" value="<?php echo wp_create_nonce('worknoon_chat_admin'); ?>">
            <input type="hidden" id="worknoon-current-user-id" value="<?php echo get_user_meta(get_current_user_id(), '_worknoon_backend_id', true); ?>">
        </div>
        <?php
    }

    // ─── Render: Users ─────────────────────────────────────────────────────

    public function render_users_page()
    {
        $this->ensure_admin_authenticated();
        $users = $this->get_backend_users();
        ?>
        <div class="wrap worknoon-admin-users">
            <h1><?php _e('Chat Users', 'worknoon-chat'); ?></h1>
            <div class="worknoon-users-toolbar">
                <div class="worknoon-user-filters">
                    <select id="worknoon-filter-user-role"><option value=""><?php _e('All Roles', 'worknoon-chat'); ?></option><option value="admin"><?php _e('Admins', 'worknoon-chat'); ?></option><option value="agent"><?php _e('Agents', 'worknoon-chat'); ?></option><option value="designer"><?php _e('Designers', 'worknoon-chat'); ?></option><option value="merchant"><?php _e('Merchants', 'worknoon-chat'); ?></option><option value="customer"><?php _e('Customers', 'worknoon-chat'); ?></option></select>
                    <input type="text" id="worknoon-search-users" placeholder="<?php _e('Search users...', 'worknoon-chat'); ?>">
                </div>
                <button type="button" class="button button-primary" id="worknoon-sync-users"><?php _e('Sync WordPress Users', 'worknoon-chat'); ?></button>
            </div>
            <table class="wp-list-table widefat fixed striped">
                <thead><tr><th><?php _e('User', 'worknoon-chat'); ?></th><th><?php _e('Role', 'worknoon-chat'); ?></th><th><?php _e('Status', 'worknoon-chat'); ?></th><th><?php _e('Actions', 'worknoon-chat'); ?></th></tr></thead>
                <tbody id="worknoon-users-list">
                    <?php if (!empty($users)): foreach ($users as $u): ?>
                        <tr><td><strong><?php echo esc_html($u['name'] ?? $u['email'] ?? '?'); ?></strong><br><small><?php echo esc_html($u['email'] ?? ''); ?></small></td><td><span class="worknoon-role-badge worknoon-role-<?php echo esc_attr($u['role']); ?>"><?php echo esc_html(ucfirst($u['role'])); ?></span></td><td><?php echo !empty($u['status']['isOnline']) ? '🟢 Online' : '⚪ Offline'; ?></td><td><a href="<?php echo admin_url('admin.php?page=worknoon-chat-conversations&user=' . esc_attr($u['_id'])); ?>" class="button button-small"><?php _e('Chats', 'worknoon-chat'); ?></a></td></tr>
                    <?php endforeach; else: ?>
                        <tr><td colspan="4"><?php _e('No users found. Click "Sync WordPress Users" to import users.', 'worknoon-chat'); ?></td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    private function get_backend_users()
    {
        // Try to use master token first for admin users
        $master_token = $this->get_master_token();
        if (!empty($master_token)) {
            $response = $this->external_api_request('/users', 'GET');
            if (!is_wp_error($response)) {
                $body = json_decode(wp_remote_retrieve_body($response), true);
                if (isset($body['data']['data']) && is_array($body['data']['data'])) {
                    return $body['data']['data'];
                }
                if (isset($body['data']['users']) && is_array($body['data']['users'])) {
                    return $body['data']['users'];
                }
            }
        }

        // Fallback to user JWT token
        $user_id = get_current_user_id();
        $jwt = get_user_meta($user_id, '_worknoon_jwt_token', true);
        if (empty($jwt)) return array();

        $response = $this->make_backend_request('/users', 'GET', null, $jwt);
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            $users = $body['data'] ?? $body ?? array();
            if (isset($users['users'])) $users = $users['users'];
            return is_array($users) ? $users : array();
        }
        return array();
    }

    // ─── Render: Analytics ─────────────────────────────────────────────────

    public function render_analytics_page()
    {
        $this->ensure_admin_authenticated();

        // Fetch real data from backend using working methods
        $conversations = $this->fetch_all_conversations();
        $users = $this->fetch_all_users();

        // Calculate statistics
        $total_conversations = count($conversations);
        $unread_messages = 0;
        foreach ($conversations as $conv) {
            $unread_messages += $conv['unreadCount'] ?? 0;
        }

        $total_users = count($users);
        $online_users = count(array_filter($users, function($u) {
            return !empty($u['status']['isOnline']);
        }));

        // Calculate role distribution
        $roles = ['admin' => 0, 'agent' => 0, 'designer' => 0, 'merchant' => 0, 'customer' => 0];
        foreach ($users as $u) {
            if (isset($u['role']) && isset($roles[$u['role']])) {
                $roles[$u['role']]++;
            }
        }

        // Calculate conversation types
        $conversation_types = [];
        foreach ($conversations as $conv) {
            $type = $conv['type'] ?? 'unknown';
            $conversation_types[$type] = ($conversation_types[$type] ?? 0) + 1;
        }

        // Calculate messages today
        $today = date('Y-m-d');
        $messages_today = 0;
        foreach ($conversations as $conv) {
            $updated = $conv['updatedAt'] ?? '';
            if (strpos($updated, $today) === 0) {
                $messages_today++;
            }
        }
        ?>
        <div class="wrap worknoon-admin-analytics">
            <h1><?php _e('Chat Analytics', 'worknoon-chat'); ?></h1>

            <!-- Statistics Cards -->
            <div class="worknoon-stats-grid" style="margin-bottom: 30px;">
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">💬</div>
                    <div class="worknoon-stat-content">
                        <h3><?php echo number_format($total_conversations); ?></h3>
                        <p><?php _e('Total Conversations', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">📩</div>
                    <div class="worknoon-stat-content">
                        <h3><?php echo number_format($unread_messages); ?></h3>
                        <p><?php _e('Unread Messages', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">👥</div>
                    <div class="worknoon-stat-content">
                        <h3><?php echo number_format($total_users); ?></h3>
                        <p><?php _e('Total Users', 'worknoon-chat'); ?></p>
                    </div>
                </div>
                <div class="worknoon-stat-card">
                    <div class="worknoon-stat-icon">🟢</div>
                    <div class="worknoon-stat-content">
                        <h3><?php echo number_format($online_users); ?></h3>
                        <p><?php _e('Users Online', 'worknoon-chat'); ?></p>
                    </div>
                </div>
            </div>

            <div class="worknoon-dashboard-grid">
                <div class="worknoon-dashboard-main">
                    <!-- User Roles Distribution -->
                    <div class="worknoon-card">
                        <h2><?php _e('User Roles Distribution', 'worknoon-chat'); ?></h2>
                        <div id="worknoon-roles-chart" style="padding: 20px;">
                            <?php if ($total_users === 0): ?>
                                <p class="worknoon-no-data">No users found. Sync users to see data.</p>
                            <?php else: ?>
                                <?php foreach ($roles as $role => $count): ?>
                                    <?php if ($count > 0 || $role === 'customer'): ?>
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee;">
                                        <span style="text-transform: capitalize; font-weight: 500;"><?php echo esc_html($role); ?></span>
                                        <div style="display: flex; align-items: center; gap: 15px;">
                                            <div style="background: #e5e7eb; height: 8px; width: 150px; border-radius: 4px; overflow: hidden;">
                                                <div style="background: #4f46e5; height: 100%; width: <?php echo $total_users > 0 ? ($count / $total_users * 100) : 0; ?>%;"></div>
                                            </div>
                                            <span style="font-weight: bold; min-width: 30px; text-align: right;"><?php echo $count; ?></span>
                                        </div>
                                    </div>
                                    <?php endif; ?>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- Conversation Types -->
                    <div class="worknoon-card" style="margin-top: 20px;">
                        <h2><?php _e('Conversation Types', 'worknoon-chat'); ?></h2>
                        <div style="padding: 20px;">
                            <?php if (empty($conversation_types)): ?>
                                <p class="worknoon-no-data">No conversations yet.</p>
                            <?php else: ?>
                                <?php foreach ($conversation_types as $type => $count): ?>
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee;">
                                    <span style="text-transform: capitalize; font-weight: 500;">
                                        <?php
                                        $type_labels = [
                                            'buyer-agent' => 'Support Chat',
                                            'buyer-designer' => 'Designer Chat',
                                            'buyer-merchant' => 'Merchant Chat',
                                            'agent-designer' => 'Internal: Agent-Designer',
                                            'agent-merchant' => 'Internal: Agent-Merchant'
                                        ];
                                        echo esc_html($type_labels[$type] ?? str_replace('-', ' ', $type));
                                        ?>
                                    </span>
                                    <span style="font-weight: bold; background: #4f46e5; color: white; padding: 4px 12px; border-radius: 12px;"><?php echo $count; ?></span>
                                </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>

                <div class="worknoon-dashboard-sidebar">
                    <!-- System Overview -->
                    <div class="worknoon-card">
                        <h2><?php _e('System Overview', 'worknoon-chat'); ?></h2>
                        <div style="padding: 20px;">
                            <p style="margin-bottom: 10px;"><strong>Backend API:</strong> <span id="worknoon-api-status-analytics" class="worknoon-status-badge worknoon-status-checking">Checking...</span></p>
                            <p style="margin-bottom: 10px;"><strong>Master Token:</strong> <span id="worknoon-master-token-status-analytics" class="worknoon-status-badge worknoon-status-checking">Checking...</span></p>
                            <p style="margin-bottom: 10px;"><strong>Active Today:</strong> <?php echo number_format($messages_today); ?> conversations</p>
                            <p><strong>Last Updated:</strong> <?php echo date('Y-m-d H:i:s'); ?></p>
                        </div>
                    </div>

                    <!-- Quick Stats -->
                    <div class="worknoon-card" style="margin-top: 20px;">
                        <h2><?php _e('Quick Stats', 'worknoon-chat'); ?></h2>
                        <div style="padding: 20px;">
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                                <span>Data Source</span>
                                <span style="font-weight: 500; color: #4f46e5;">Master Token</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                                <span>API Endpoint</span>
                                <span style="font-family: monospace; font-size: 12px;"><?php echo esc_html($this->api_base_url); ?></span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                <span>Token Status</span>
                                <span style="color: <?php echo $this->get_master_token() ? 'green' : 'red'; ?>;">
                                    <?php echo $this->get_master_token() ? '✓ Configured' : '✗ Missing'; ?>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <script>
        jQuery(document).ready(function($) {
            // Check API status on analytics page
            $.ajax({
                url: ajaxurl,
                type: 'POST',
                data: {
                    action: 'worknoon_test_connection',
                    nonce: worknoonChatAdmin.nonce
                },
                success: function(response) {
                    var $status = $('#worknoon-api-status-analytics');
                    if (response.success) {
                        $status.removeClass('worknoon-status-checking worknoon-status-error')
                               .addClass('worknoon-status-ok')
                               .text('Connected');
                    } else {
                        $status.removeClass('worknoon-status-checking worknoon-status-ok')
                               .addClass('worknoon-status-error')
                               .text('Error');
                    }
                },
                error: function() {
                    $('#worknoon-api-status-analytics').removeClass('worknoon-status-checking worknoon-status-ok')
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
                        var $status = $('#worknoon-master-token-status-analytics');
                        if (response.success) {
                            $status.removeClass('worknoon-status-checking worknoon-status-error')
                                   .addClass('worknoon-status-ok')
                                   .text('Valid');
                        } else {
                            $status.removeClass('worknoon-status-checking worknoon-status-ok')
                                   .addClass('worknoon-status-error')
                                   .text('Invalid');
                        }
                    },
                    error: function() {
                        $('#worknoon-master-token-status-analytics').removeClass('worknoon-status-checking worknoon-status-ok')
                                                                .addClass('worknoon-status-error')
                                                                .text('Error');
                    }
                });
            } else {
                $('#worknoon-master-token-status-analytics').removeClass('worknoon-status-checking worknoon-status-ok')
                                                        .addClass('worknoon-status-error')
                                                        .text('Not Configured');
            }
        });
        </script>
        <?php
    }

    // ─── Render: Settings ──────────────────────────────────────────────────

    public function render_settings_page()
    {
        if (isset($_POST['save_worknoon_settings'])) {
            check_admin_referer('worknoon_chat_settings');
            $settings = array(
                'enable_chat' => isset($_POST['enable_chat']),
                'allow_guest_chat' => isset($_POST['allow_guest_chat']),
                'email_notifications' => isset($_POST['email_notifications']),
                'primary_color' => sanitize_hex_color($_POST['primary_color']),
                'position' => sanitize_text_field($_POST['position']),
                'api_endpoint' => esc_url_raw($_POST['api_endpoint']),
                'socket_endpoint' => esc_url_raw($_POST['socket_endpoint']),
                'master_token' => sanitize_text_field($_POST['master_token']),
            );
            $settings['master_api_key'] = $settings['master_token'];
            update_option('worknoon_chat_settings', $settings);
            echo '<div class="notice notice-success"><p>' . __('Settings saved.', 'worknoon-chat') . '</p></div>';
        }

        $settings = get_option('worknoon_chat_settings', array());
        $master_token = $settings['master_token'] ?? $settings['master_api_key'] ?? '';
        ?>
        <div class="wrap">
            <h1><?php _e('Worknoon Chat Settings', 'worknoon-chat'); ?></h1>
            <form method="post">
                <?php wp_nonce_field('worknoon_chat_settings'); ?>
                <table class="form-table">
                    <tr><th><?php _e('Enable Chat', 'worknoon-chat'); ?></th><td><label><input type="checkbox" name="enable_chat" <?php checked(!empty($settings['enable_chat'])); ?>> <?php _e('Enable chat widget on frontend', 'worknoon-chat'); ?></label></td></tr>
                    <tr><th><?php _e('Guest Chat', 'worknoon-chat'); ?></th><td><label><input type="checkbox" name="allow_guest_chat" <?php checked(!empty($settings['allow_guest_chat'])); ?>> <?php _e('Allow guest users to start chat', 'worknoon-chat'); ?></label></td></tr>
                    <tr><th><?php _e('Email Notifications', 'worknoon-chat'); ?></th><td><label><input type="checkbox" name="email_notifications" <?php checked(!empty($settings['email_notifications'])); ?>> <?php _e('Send email notifications for new messages', 'worknoon-chat'); ?></label></td></tr>
                    <tr><th><?php _e('Primary Color', 'worknoon-chat'); ?></th><td><input type="color" name="primary_color" value="<?php echo esc_attr($settings['primary_color'] ?? '#4f46e5'); ?>"></td></tr>
                    <tr><th><?php _e('Widget Position', 'worknoon-chat'); ?></th><td><select name="position"><option value="bottom-right" <?php selected($settings['position'] ?? '', 'bottom-right'); ?>><?php _e('Bottom Right', 'worknoon-chat'); ?></option><option value="bottom-left" <?php selected($settings['position'] ?? '', 'bottom-left'); ?>><?php _e('Bottom Left', 'worknoon-chat'); ?></option></select></td></tr>
                    <tr><th><?php _e('Backend API Endpoint', 'worknoon-chat'); ?></th><td><input type="url" name="api_endpoint" value="<?php echo esc_attr($settings['api_endpoint'] ?? 'http://localhost:5001/api'); ?>" class="regular-text"><p class="description"><?php _e('Node.js backend API URL (e.g., http://localhost:5001/api)', 'worknoon-chat'); ?></p></td></tr>
                    <tr><th><?php _e('Socket.IO Endpoint', 'worknoon-chat'); ?></th><td><input type="url" name="socket_endpoint" value="<?php echo esc_attr($settings['socket_endpoint'] ?? 'http://localhost:5001'); ?>" class="regular-text"><p class="description"><?php _e('Socket.IO server URL for real-time messaging', 'worknoon-chat'); ?></p></td></tr>
                    <tr><th><?php _e('Master Token', 'worknoon-chat'); ?></th><td><input type="text" name="master_token" value="<?php echo esc_attr($master_token); ?>" class="regular-text code" placeholder="wnt_..." style="font-family:monospace; width:100%; max-width:500px;"><p class="description"><?php _e('Generate this in your Worknoon admin panel: <strong>Admin Dashboard → Master Tokens → Generate Token</strong>', 'worknoon-chat'); ?></p><p class="description" style="color:#6b7280;margin-top:4px;">⚡ The token acts as a permanent login key. Paste the <code>wnt_</code> key to pull conversations, messages, and users into WordPress.</p></td></tr>
                </table>
                <?php submit_button(__('Save Settings', 'worknoon-chat'), 'primary', 'save_worknoon_settings'); ?>
            </form>
            <hr>
            <h2><?php _e('Connection Tests', 'worknoon-chat'); ?></h2>
            <p><button type="button" class="button button-primary" id="test-api-connection"><?php _e('Test Backend Connection', 'worknoon-chat'); ?></button> <span id="api-test-result" style="margin-left:10px;font-weight:500;"></span></p>
            <p><button type="button" class="button" id="test-master-token"><?php _e('Test Master Token Auth', 'worknoon-chat'); ?></button> <span id="master-token-result" style="margin-left:10px;font-weight:500;"></span></p>
        </div>
        <?php
    }

    // ─── Shortcodes ────────────────────────────────────────────────────────

    public function render_chat_widget($atts)
    {
        $atts = shortcode_atts(array('conversation_id' => ''), $atts);
        ob_start(); ?>
        <div id="worknoon-chat-widget" class="worknoon-chat-widget" data-conversation-id="<?php echo esc_attr($atts['conversation_id']); ?>">
            <div class="chat-widget-container"><div class="chat-content"><div class="chat-loading"><div class="chat-spinner"></div><p>Loading...</p></div></div></div>
            <button class="chat-fab" aria-label="Open chat"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span class="chat-notification-badge" id="chat-notification-badge" style="display:none;">0</span></button>
        </div>
        <?php return ob_get_clean();
    }

    public function render_chat_button($atts)
    {
        $atts = shortcode_atts(array('text' => __('Start Chat', 'worknoon-chat'), 'agent_id' => '', 'type' => 'buyer-agent'), $atts);
        return '<button class="worknoon-chat-btn" data-agent-id="' . esc_attr($atts['agent_id']) . '" data-type="' . esc_attr($atts['type']) . '">' . esc_html($atts['text']) . '</button>';
    }

    // ─── WooCommerce ───────────────────────────────────────────────────────

    public function add_chat_to_order_page($order)
    {
        $order_id = $order->get_id();
        $user_id = get_current_user_id();
        $conversation_id = $this->get_or_create_order_conversation($order_id, $user_id);
        echo '<h2>' . __('Order Chat', 'worknoon-chat') . '</h2>';
        echo do_shortcode('[worknoon_chat conversation_id="' . $conversation_id . '"]');
    }

    public function add_chat_to_product_page()
    {
        global $product;
        if (!$product) return;
        echo '<div class="product-chat-section"><h3>' . __('Questions about this product?', 'worknoon-chat') . '</h3><button class="worknoon-chat-btn" data-product-id="' . esc_attr($product->get_id()) . '" data-type="buyer-merchant">' . __('Chat with us', 'worknoon-chat') . '</button></div>';
    }

    private function get_or_create_order_conversation($order_id, $user_id)
    {
        $conversation_id = get_post_meta($order_id, '_worknoon_conversation_id', true);
        if ($conversation_id) return $conversation_id;

        $backend_id = get_user_meta($user_id, '_worknoon_backend_id', true);
        if (!$backend_id) return '';

        $response = $this->make_backend_request('/conversations', 'POST', array(
            'participantIds' => array(
                array('userId' => $backend_id, 'role' => 'customer'),
                array('userId' => 'agent', 'role' => 'agent'),
            ),
            'type' => 'buyer-agent',
            'orderId' => $order_id,
        ));

        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (!empty($body['data']['conversation']['_id'])) {
                $cid = $body['data']['conversation']['_id'];
                update_post_meta($order_id, '_worknoon_conversation_id', $cid);
                return $cid;
            }
        }
        return '';
    }

    // ─── AJAX Handlers ─────────────────────────────────────────────────────

    public function ajax_test_connection()
    {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');
        $settings = get_option('worknoon_chat_settings', array());
        $api_endpoint = $settings['api_endpoint'] ?? 'http://localhost:5001/api';

        $response = $this->make_backend_request('/health', 'GET');
        if (is_wp_error($response)) {
            wp_send_json_error('Connection failed: ' . $response->get_error_message());
        }

        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code >= 200 && $status_code < 300) {
            wp_send_json_success('Connected successfully to ' . $api_endpoint);
        } else {
            wp_send_json_error('Connection failed with status code: ' . $status_code);
        }
    }

    public function ajax_test_master_token()
    {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');

        $token = $this->get_master_token();
        if (empty($token)) {
            wp_send_json_error('Master token not configured. Please add your token in the settings above.');
            return;
        }

        // Test the master token by calling the external health endpoint
        $response = $this->external_api_request('/health', 'GET');
        if (is_wp_error($response)) {
            wp_send_json_error('Master token test failed: ' . $response->get_error_message());
            return;
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($status_code === 200 && isset($body['success']) && $body['success'] === true) {
            $admin_info = $body['admin'] ?? array();
            $admin_name = !empty($admin_info['name']) ? $admin_info['name'] : (!empty($admin_info['email']) ? $admin_info['email'] : 'Unknown');
            wp_send_json_success('Master token authenticated successfully! Connected as: ' . $admin_name);
        } elseif ($status_code === 401) {
            wp_send_json_error('Invalid master token. Please check your token and try again.');
        } else {
            wp_send_json_error('Master token test failed with status code: ' . $status_code);
        }
    }

    public function ajax_sync_users()
    {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Permission denied');
        }

        $users = get_users(array('role__in' => array('administrator', 'shop_manager', 'customer', 'subscriber', 'contributor', 'author'), 'number' => -1));
        $synced = $failed = 0;

        foreach ($users as $user) {
            $this->sync_user_to_backend($user->ID);
            if (get_user_meta($user->ID, '_worknoon_backend_id', true)) $synced++;
            else $failed++;
        }

        $current_user_id = get_current_user_id();
        $this->sync_user_to_backend($current_user_id);
        $this->authenticate_with_backend('', get_userdata($current_user_id));

        wp_send_json_success(array('message' => sprintf('Synced %d users successfully. %d failed.', $synced, $failed), 'synced' => $synced, 'failed' => $failed));
    }

    public function ajax_handle_file_upload()
    {
        check_ajax_referer('worknoon_chat_nonce', 'nonce');
        if (!isset($_FILES['file']) || empty($_FILES['file']['tmp_name'])) {
            wp_send_json_error('No file uploaded');
        }

        $file = $_FILES['file'];
        if ($file['size'] > 5 * 1024 * 1024) {
            wp_send_json_error('File is too large. Maximum size is 5MB.');
        }

        $token = isset($_POST['token']) ? sanitize_text_field($_POST['token']) : '';
        if (empty($token)) {
            $user_id = get_current_user_id();
            if ($user_id) $token = get_user_meta($user_id, '_worknoon_jwt_token', true);
        }
        if (empty($token)) wp_send_json_error('Authentication required');

        $upload_url = $this->api_base_url . '/upload/single';
        $temp_file = wp_tempnam($file['name']);
        copy($file['tmp_name'], $temp_file);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $upload_url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, array('file' => new CURLFile($temp_file, $file['type'], $file['name'])));
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Authorization: Bearer ' . $token));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response_body = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);
        @unlink($temp_file);

        if ($curl_error) wp_send_json_error('Upload failed: ' . $curl_error);
        if ($http_code >= 200 && $http_code < 300) {
            $data = json_decode($response_body, true);
            wp_send_json_success($data['data'] ?? $data);
        } else {
            wp_send_json_error('Upload failed with status: ' . $http_code);
        }
    }

    // ─── Activation / Deactivation ─────────────────────────────────────────

    public function activate()
    {
        $this->register_chat_session_post_type();
        flush_rewrite_rules();
        add_option('worknoon_chat_settings', array(
            'enable_chat' => true,
            'allow_guest_chat' => false,
            'email_notifications' => true,
            'primary_color' => '#4f46e5',
            'position' => 'bottom-right',
            'api_endpoint' => 'http://localhost:5001/api',
            'socket_endpoint' => 'http://localhost:5001',
            'master_token' => '',
            'master_api_key' => '',
        ));
    }

    public function deactivate()
    {
        flush_rewrite_rules();
    }
}

Worknoon_Chat::get_instance();
