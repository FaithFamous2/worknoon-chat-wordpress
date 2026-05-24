# WordPress Testing Guide for Worknoon Chat

This guide explains how to test the Worknoon Chat plugin and Storefront child theme.

## Option 1: Local Development (Recommended for Development)

### Using MAMP/XAMPP (Mac/Windows)

1. **Install MAMP or XAMPP**
   - Download from [MAMP](https://www.mamp.info/) (Mac) or [XAMPP](https://www.apachefriends.org/) (Windows/Mac/Linux)
   - Install and start Apache + MySQL

2. **Install WordPress**
   ```bash
   # Download WordPress
   cd /Applications/MAMP/htdocs  # Mac
   # OR
   cd C:\xampp\htdocs          # Windows

   wget https://wordpress.org/latest.tar.gz
   tar -xzf latest.tar.gz
   mv wordpress worknoon-chat-test
   ```

3. **Create Database**
   - Open phpMyAdmin: http://localhost/phpMyAdmin
   - Create database: `worknoon_chat_test`
   - Create user with privileges

4. **Configure WordPress**
   - Visit: http://localhost/worknoon-chat-test
   - Follow setup wizard
   - Complete installation

5. **Install WooCommerce**
   - Go to WP Admin → Plugins → Add New
   - Search "WooCommerce"
   - Install and activate
   - Complete WooCommerce setup

6. **Install Storefront Theme**
   - Go to Appearance → Themes → Add New
   - Search "Storefront"
   - Install and activate

7. **Install Worknoon Chat Plugin**
   ```bash
   # Copy plugin files
   cp -r /path/to/worknoon-chat-wordpress/worknoon-chat.php /Applications/MAMP/htdocs/worknoon-chat-test/wp-content/plugins/
   cp -r /path/to/worknoon-chat-wordpress/assets /Applications/MAMP/htdocs/worknoon-chat-test/wp-content/plugins/worknoon-chat/
   ```

8. **Activate Plugin**
   - Go to WP Admin → Plugins
   - Find "Worknoon Chat"
   - Click "Activate"

9. **Install Child Theme (Optional)**
   ```bash
   cp -r /path/to/worknoon-chat-wordpress/themes/worknoon-chat-storefront /Applications/MAMP/htdocs/worknoon-chat-test/wp-content/themes/
   ```
   - Go to Appearance → Themes
   - Activate "Worknoon Chat Storefront"

---

### Using LocalWP (Easiest - Free Tool by Flywheel)

1. **Download LocalWP**
   - Get it from: https://localwp.com/
   - Install and open

2. **Create New Site**
   - Click "+" → "Create a new site"
   - Name: `worknoon-chat-test`
   - Choose "Preferred" environment
   - Set username/password
   - Create site

3. **Install WooCommerce & Storefront**
   - Click "Open site" → Admin
   - Install WooCommerce (Plugins → Add New)
   - Install Storefront theme

4. **Add Worknoon Chat**
   - Right-click site → "Open site folder"
   - Navigate to `app/public/wp-content/plugins/`
   - Copy plugin files
   - Activate in WP Admin

---

### Using Docker (For Developers)

1. **Create docker-compose.yml**
   ```yaml
   version: '3.8'

   services:
     wordpress:
       image: wordpress:latest
       ports:
         - "8080:80"
       environment:
         WORDPRESS_DB_HOST: db:3306
         WORDPRESS_DB_USER: wordpress
         WORDPRESS_DB_PASSWORD: wordpress
         WORDPRESS_DB_NAME: wordpress
       volumes:
         - ./wordpress:/var/www/html
         - ./worknoon-chat-wordpress:/var/www/html/wp-content/plugins/worknoon-chat
       depends_on:
         - db

     db:
       image: mysql:5.7
       environment:
         MYSQL_ROOT_PASSWORD: root
         MYSQL_DATABASE: wordpress
         MYSQL_USER: wordpress
         MYSQL_PASSWORD: wordpress
       volumes:
         - db_data:/var/lib/mysql

   volumes:
     db_data:
   ```

2. **Start Containers**
   ```bash
   docker-compose up -d
   ```

3. **Access WordPress**
   - Visit: http://localhost:8080
   - Complete setup

---

## Option 2: Online Testing (Staging)

### Using WordPress.com Business Plan
1. Sign up at https://wordpress.com/
2. Upgrade to Business plan (required for plugins)
3. Upload plugin via WP Admin
4. Test functionality

### Using Cheap Shared Hosting
Recommended for quick testing:
- **Namecheap**: https://www.namecheap.com/hosting/shared/
- **Hostinger**: https://www.hostinger.com/
- **SiteGround**: https://www.siteground.com/

Steps:
1. Buy hosting (~$3-10/month)
2. Install WordPress (usually one-click)
3. Upload plugin via FTP or WP Admin
4. Test

---

## Option 3: WordPress Playground (Instant - No Setup)

### Online WordPress Testing
Use WordPress Playground for instant testing:
- https://playground.wordpress.net/

**Limitations:**
- No email sending
- No external API calls
- Temporary (data lost on refresh)
- Good for quick UI testing only

---

## Testing Checklist

### Plugin Testing
- [ ] Activate plugin without errors
- [ ] Check "Chat Sessions" menu appears in Admin
- [ ] Create a test chat session
- [ ] Verify REST API endpoints work:
  ```bash
  curl http://localhost/wp-json/worknoon-chat/v1/settings
  ```

### Theme Testing
- [ ] Activate Storefront child theme
- [ ] Check floating chat button appears
- [ ] Click button - chat widget opens
- [ ] Send test message
- [ ] Check message appears in admin

### WooCommerce Integration
- [ ] Install WooCommerce
- [ ] Create test product
- [ ] Check "Chat with us" button on product page
- [ ] Create test order
- [ ] Check chat section on order page

### AJAX Messaging
- [ ] Open browser console (F12)
- [ ] Send message
- [ ] Check Network tab for AJAX calls
- [ ] Verify 200 responses
- [ ] Check messages load on page refresh

---

## Quick Test Commands

### Check if Plugin is Active
```bash
wp plugin list --status=active --path=/path/to/wordpress
```

### Check REST API
```bash
curl -X GET http://localhost/wp-json/worknoon-chat/v1/settings
```

### Check AJAX Endpoint
```bash
curl -X POST http://localhost/wp-admin/admin-ajax.php \
  -d "action=worknoon_chat_get_settings"
```

---

## Troubleshooting

### Plugin Not Appearing
- Check file permissions (755 for directories, 644 for files)
- Ensure `worknoon-chat.php` is in plugin root
- Check WordPress version compatibility

### Chat Widget Not Showing
- Check if "Enable Chat" is checked in settings
- Clear browser cache
- Check browser console for JavaScript errors
- Verify jQuery is loaded

### AJAX Not Working
- Check permalinks are enabled (Settings → Permalinks)
- Verify nonce is being passed
- Check browser Network tab for errors
- Ensure user is logged in (if required)

### WooCommerce Not Integrating
- Verify WooCommerce is active
- Check theme supports WooCommerce
- Ensure product/order pages load correctly

---

## Recommended Testing Flow

1. **Local Setup** (MAMP/LocalWP) - 15 minutes
2. **Install WooCommerce** - 5 minutes
3. **Install Plugin** - 2 minutes
4. **Basic Chat Test** - 5 minutes
5. **WooCommerce Integration Test** - 10 minutes
6. **Mobile Responsive Test** - 5 minutes

**Total: ~45 minutes for complete testing**

---

## Need Help?

If you encounter issues:
1. Check browser console for JavaScript errors
2. Check WordPress debug log: `wp-content/debug.log`
3. Enable WordPress debug mode in `wp-config.php`:
   ```php
   define('WP_DEBUG', true);
   define('WP_DEBUG_LOG', true);
