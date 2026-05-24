# Worknoon Chat - WordPress Plugin

A WordPress plugin that integrates real-time chat functionality into eCommerce platforms, enabling communication between customers, support agents, designers, and merchants.

## Features

### Core Features
- **Custom Post Type**: Chat Session management within WordPress admin
- **REST API**: Full REST API for chat operations
- **AJAX Messaging**: Real-time messaging via AJAX polling
- **Shortcodes**: Easy integration with `[worknoon_chat]` and `[worknoon_chat_button]`
- **User Roles**: Support for customers, agents, designers, and merchants

### WooCommerce Integration
- **Order Chat**: Automatic chat session creation for each order
- **Product Chat**: Chat button on product pages for pre-sales questions
- **Context-Aware**: Chat includes order/product context

### Admin Features
- **Chat Management**: View and manage all chat sessions in WordPress admin
- **Settings Page**: Configure colors, position, notifications
- **Email Notifications**: Automatic email alerts for new messages
- **Online Status**: Track agent availability

### Frontend Features
- **Floating Widget**: Collapsible chat widget on all pages
- **Responsive Design**: Mobile-friendly interface
- **Dark Mode**: Automatic dark mode support
- **Typing Indicators**: Show when someone is typing
- **File Attachments**: Support for images and documents

## Installation

1. Download the plugin files
2. Upload to `/wp-content/plugins/worknoon-chat/`
3. Activate the plugin through the 'Plugins' menu in WordPress
4. Configure settings under Chat Sessions > Settings

## Usage

### Basic Shortcode
Add the chat widget to any page or post:
```
[worknoon_chat]
```

### Chat Button
Add a chat start button:
```
[worknoon_chat_button text="Chat with Support"]
```

### WooCommerce Integration
The plugin automatically adds chat to:
- Order detail pages (for order-specific support)
- Product pages (for pre-sales questions)

## Configuration

### Settings
- **Enable Chat**: Toggle chat widget on/off
- **Guest Chat**: Allow non-logged-in users to chat
- **Email Notifications**: Send email alerts for new messages
- **Primary Color**: Customize the chat widget color
- **Widget Position**: Bottom-left or bottom-right
- **External API**: Connect to external Node.js chat server

### User Roles
The plugin works with these WordPress roles:
- **Customer**: Can initiate chats and communicate
- **Support Agent**: Can accept and manage chat sessions
- **Shop Manager**: Full chat management access
- **Administrator**: Full access to all features

## REST API Endpoints

### Authentication
All endpoints require WordPress authentication (nonce).

### Endpoints

#### Get Chat Sessions
```
GET /wp-json/worknoon-chat/v1/sessions
```

#### Create Chat Session
```
POST /wp-json/worknoon-chat/v1/sessions
Body: { "title": "Support Chat", "type": "support", "agent_id": 123 }
```

#### Get Messages
```
GET /wp-json/worknoon-chat/v1/sessions/{id}/messages
```

#### Send Message
```
POST /wp-json/worknoon-chat/v1/sessions/{id}/messages
Body: { "content": "Hello!" }
```

#### Get Available Agents
```
GET /wp-json/worknoon-chat/v1/agents
```

#### Get Settings
```
GET /wp-json/worknoon-chat/v1/settings
```

## File Structure

```
worknoon-chat-wordpress/
├── worknoon-chat.php          # Main plugin file
├── README.md                   # This file
├── assets/
│   ├── css/
│   │   └── chat-widget.css    # Frontend styles
│   └── js/
│       └── chat-widget.js     # Frontend JavaScript
```

## Technologies Used

- **PHP**: WordPress plugin architecture
- **JavaScript**: jQuery-based frontend interactions
- **WordPress REST API**: Backend communication
- **AJAX**: Real-time message polling
- **CSS3**: Responsive styling with CSS variables

## Integration with External Chat Server

To connect with the Node.js chat server:

1. Go to Chat Sessions > Settings
2. Enter the external API endpoint URL
3. The plugin will use the external server for real-time features

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Security

- WordPress nonce verification on all AJAX requests
- Capability checks for admin functions
- Data sanitization and escaping
- Prepared statements for database queries

## Changelog

### 1.0.0
- Initial release
- Custom post type for chat sessions
- REST API endpoints
- WooCommerce integration
- AJAX messaging system
- Responsive chat widget
- Email notifications

## License

GPL v2 or later

## Support

For support, please contact: careers@worknoon.com
