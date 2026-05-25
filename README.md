# Worknoon Chat WordPress Plugin

WordPress plugin for integrating Worknoon Chat system with WooCommerce and any WordPress site.

## Features

- **Custom Post Type**: Chat Session management in WordPress admin
- **Shortcodes**: `[worknoon_chat]` and `[worknoon_chat_button]` for easy integration
- **REST API Integration**: Connects to Node.js backend API
- **Socket.IO Real-time**: Live messaging with fallback to polling
- **WooCommerce Integration**: Chat on product and order pages
- **Guest Chat Support**: Optional anonymous chat functionality
- **User Sync**: Automatic WordPress user synchronization with backend

## Requirements

- WordPress 5.8+
- PHP 7.4+
- Node.js Backend running (see worknoon-chat-backend)
- WooCommerce (optional, for eCommerce features)

## Installation

### 1. Install the Plugin

1. Copy the `worknoon-chat-wordpress` folder to `/wp-content/plugins/`
2. Activate the plugin in WordPress Admin → Plugins
3. Go to Chat Sessions → Settings to configure

### 2. Configure Backend Connection

In WordPress Admin, go to **Chat Sessions → Settings**:

| Setting | Description | Default |
|---------|-------------|---------|
| Backend API Endpoint | Node.js API URL | `http://localhost:5001/api` |
| Socket.IO Endpoint | Socket server URL | `http://localhost:5001` |
| Enable Chat | Show widget on frontend | Enabled |
| Allow Guest Chat | Anonymous users can chat | Disabled |
| Primary Color | Widget accent color | `#4f46e5` |
| Widget Position | Bottom-left or right | `bottom-right` |

### 3. Start the Backend Server

```bash
# In worknoon-chat-backend directory
npm install
npm run dev
# or
npm start
```

## Usage

### Shortcodes

**Full Chat Widget:**
```
[worknoon_chat]
```

**Chat Widget with specific conversation:**
```
[worknoon_chat conversation_id="CONVERSATION_ID"]
```

**Chat Button (opens widget):**
```
[worknoon_chat_button text="Chat with us" type="buyer-agent"]
```

### WooCommerce Integration

The plugin automatically adds chat to:
- Product pages (customer can ask about product)
- Order pages (order-specific support chat)

### Template Functions

```php
// Check if chat is enabled
if (worknoon_chat_is_enabled()) {
    // Display custom chat trigger
    echo do_shortcode('[worknoon_chat_button text="Support"]');
}
```

## How It Works

### User Authentication Flow

1. WordPress user logs in
2. Plugin syncs user to Node.js backend via `/auth/register` or `/auth/login`
3. Backend returns JWT tokens stored in user meta
4. Frontend uses tokens for API authentication
5. Socket.IO connects with JWT for real-time messaging

### Message Flow

1. User sends message via widget
2. If Socket.IO connected: emits `send_message` event
3. If offline: sends via REST API `/messages` endpoint
4. Backend broadcasts to all participants via Socket.IO
5. Messages stored in MongoDB

### Guest Chat Flow

1. Guest clicks chat button
2. Prompted for name and email
3. Guest user registered in backend
4. Conversation created
5. Chat proceeds normally

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Authenticate user |
| `/auth/refresh` | POST | Refresh JWT token |
| `/conversations` | GET | List user's conversations |
| `/conversations` | POST | Create new conversation |
| `/conversations/:id` | GET | Get conversation details |
| `/messages` | POST | Send message |
| `/users` | GET | List available agents |

## File Structure

```
worknoon-chat-wordpress/
├── worknoon-chat.php          # Main plugin file
├── assets/
│   ├── css/
│   │   ├── chat-widget.css    # Frontend styles
│   │   └── admin.css          # Admin styles
│   └── js/
│       ├── chat-widget.js     # Frontend JavaScript
│       └── admin.js           # Admin JavaScript
├── themes/
│   └── worknoon-chat-storefront/  # Optional child theme
└── README.md
```

## Troubleshooting

### Connection Issues

1. **Test API Connection**: In Settings, click "Test Connection"
2. **Check CORS**: Ensure backend allows your WordPress domain
3. **Verify Backend**: Confirm Node.js server is running
4. **Check Console**: Look for JavaScript errors in browser console

### Common Problems

**Widget not appearing:**
- Check "Enable Chat" setting is on
- Verify shortcode is placed correctly
- Check for JavaScript errors

**Messages not sending:**
- Verify user is logged in (or guest chat enabled)
- Check JWT token is valid (re-login to refresh)
- Confirm backend is running and accessible

**Real-time not working:**
- Socket.IO falls back to polling automatically
- Check firewall isn't blocking WebSocket port
- Verify `socketUrl` in settings is correct

### Debug Mode

Add to `wp-config.php`:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

Check `/wp-content/debug.log` for API communication logs.

## Challenges & Solutions

### Challenge 1: WordPress to Node.js Authentication Bridge
**Problem**: WordPress uses session-based auth, Node.js backend uses JWT tokens. Need seamless integration.
**Solution**:
- Created custom authentication bridge in `functions.php`
- WordPress login triggers sync to Node.js backend
- JWT tokens stored in WordPress user meta
- Automatic token refresh via AJAX before expiry
- Fallback to guest mode if backend is unavailable

### Challenge 2: Real-time Messaging in WordPress Environment
**Problem**: WordPress is request/response based, but chat needs persistent connections.
**Solution**:
- Implemented Socket.IO client in vanilla JavaScript
- Connection pooling to handle multiple chat widgets
- Automatic reconnection with exponential backoff
- Fallback to AJAX polling when WebSocket fails
- Connection state management in browser localStorage

### Challenge 3: WooCommerce Contextual Chat
**Problem**: Chat needs to be product/order-aware for contextual support.
**Solution**:
- WooCommerce hooks for product and order pages
- Automatic conversation metadata injection
- Product ID and Order ID passed to backend
- Custom chat initialization for different contexts
- Pre-filled messages based on page context

### Challenge 4: Guest User Management
**Problem**: WordPress requires user accounts, but chat should support guests.
**Solution**:
- Optional guest chat mode in settings
- Temporary guest users created in backend
- Session-based guest identification
- Guest data cleanup after inactivity
- Upgrade path from guest to registered user

### Challenge 5: Shortcode Flexibility
**Problem**: Users need to place chat widgets anywhere with different configurations.
**Solution**:
- Multiple shortcodes: `[worknoon_chat]`, `[worknoon_chat_button]`
- Shortcode attributes for customization
- Widget position options (bottom-left/right)
- Customizable button text and colors
- Conversation ID parameter for specific chats

### Challenge 6: Admin Interface Integration
**Problem**: Chat management needs to fit into WordPress admin workflow.
**Solution**:
- Custom Post Type for chat sessions
- WordPress admin menu integration
- Settings page with connection testing
- Chat session listing with filters
- Inline chat preview in admin
- User synchronization status dashboard

## Security

- All API requests use JWT authentication
- Nonces verify AJAX requests
- Data sanitized with `sanitize_text_field()`, `sanitize_email()`
- SQL injection prevented via `$wpdb->prepare()`
- XSS protection via `esc_html()`, `esc_attr()`
- Capability checks for admin functions
- HTTPS enforcement for API communication

## Changelog

### 1.0.0
- Initial release
- Custom Post Type for chat sessions
- REST API integration with Node.js backend
- Socket.IO real-time messaging
- WooCommerce integration
- Guest chat support
- Admin settings page
- Role-based user synchronization
- File upload support
- Chat transfer functionality

## License

GPL v2 or later
