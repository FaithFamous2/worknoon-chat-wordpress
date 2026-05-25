# WordPress Plugin Setup Guide

## Quick Start (5 minutes)

### Step 1: Start the Backend
```bash
cd worknoon-chat-backend
npm install
npm run dev
```
Backend will run at `http://localhost:5000`

### Step 2: Install WordPress Plugin
1. Copy `worknoon-chat-wordpress` folder to `/wp-content/plugins/`
2. Activate in WordPress Admin → Plugins

### Step 3: Configure Plugin
1. Go to **Chat Sessions → Settings**
2. Set Backend API Endpoint: `http://localhost:5000/api`
3. Set Socket.IO Endpoint: `http://localhost:5000`
4. Click **Save Settings**
5. Click **Test Connection** to verify

### Step 4: Add Chat to Your Site
Add shortcode to any page/post:
```
[worknoon_chat]
```

Or add to your theme template:
```php
<?php echo do_shortcode('[worknoon_chat]'); ?>
```

## How to Use

### For Site Visitors
1. Click the chat bubble (bottom-right corner)
2. Enter name and email (if guest chat enabled)
3. Start chatting with support agents

### For WordPress Users
1. Log in to WordPress
2. Click chat bubble
3. Automatically authenticated with backend
4. Chat history persists across sessions

### For WooCommerce Stores
- Product pages: "Chat with us" button appears
- Order pages: Order-specific support chat
- Customers can ask about products or order status

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   WordPress     │────▶│  Node.js Backend   │◀────│   React Admin   │
│   (Plugin)      │     │  (MongoDB + Socket)│     │   (Frontend)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                          │
        │                          │
        ▼                          ▼
┌─────────────────┐     ┌──────────────────┐
│  WooCommerce    │     │  Socket.IO       │
│  Integration    │     │  Real-time       │
└─────────────────┘     └──────────────────┘
```

## Data Flow

1. **User Login** → WordPress syncs user to Node.js backend
2. **Open Chat** → Widget loads with JWT token
3. **Send Message** → Socket.IO emits to backend
4. **Backend Broadcasts** → All participants receive message
5. **Store in MongoDB** → Messages persist

## Common Configurations

### Local Development
```
Backend API: http://localhost:5000/api
Socket.IO:   http://localhost:5000
```

### Production with Domain
```
Backend API: https://api.yoursite.com/api
Socket.IO:   https://api.yoursite.com
```

### With SSL/HTTPS
```
Backend API: https://chat.yoursite.com/api
Socket.IO:   https://chat.yoursite.com
```

## Troubleshooting Checklist

- [ ] Backend server is running (`npm run dev`)
- [ ] Plugin settings have correct API URLs
- [ ] Test Connection button shows "Connected"
- [ ] WordPress user is logged in (or guest chat enabled)
- [ ] No JavaScript errors in browser console
- [ ] CORS is configured on backend for your WordPress domain

## Next Steps

1. Customize colors in Settings
2. Configure email notifications
3. Set up agent accounts in React Admin
4. Test guest chat flow
5. Review chat sessions in WordPress admin
