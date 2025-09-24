# SSL Configuration with Let's Encrypt

PepperQC now supports automatic SSL certificate management using Let's Encrypt through Caddy reverse proxy.

## 🚀 Quick Setup

1. **Start PepperQC** with the new Docker configuration:
   ```bash
   docker-compose up -d
   ```

2. **Access the Settings Page**: Navigate to the Settings page in your PepperQC web interface.

3. **Configure SSL**:
   - Enable the "Enable HTTPS with Let's Encrypt" toggle
   - Enter your domain name (e.g., `pepperqc.example.com`)
   - Enter your email address for Let's Encrypt notifications
   - Click "Enable SSL"

4. **DNS Configuration**: Ensure your domain points to your server's IP address:
   ```bash
   # Example DNS A record
   pepperqc.example.com → 123.456.789.012
   ```

5. **Access via HTTPS**: Once configured, PepperQC will be available at `https://your-domain.com`

## 🔧 Architecture

- **Caddy**: Reverse proxy handling SSL termination and automatic certificate renewal
- **Let's Encrypt**: Free SSL certificates with automatic renewal
- **Backend API**: Manages SSL configuration and certificate status

## 📋 Features

### ✅ Automatic Certificate Management
- Automatic certificate provisioning from Let's Encrypt
- Automatic renewal before expiration (typically 30 days before)
- Certificate status monitoring and alerts

### ✅ Unified Configuration
- Combined SSL and Telegram settings in one interface
- Real-time certificate status display
- One-click certificate renewal

### ✅ Production Ready
- HTTPS redirects from HTTP automatically enabled
- Secure headers and optimizations
- Docker volume persistence for certificates

## 🔍 Certificate Status

The Settings page displays:
- **Certificate status**: Valid, Expiring soon, or Missing
- **Expiration date**: When the current certificate expires
- **Days remaining**: Countdown to expiration
- **Renewal button**: Force renewal if needed

## 📊 Status Colors

- 🟢 **Green**: Certificate valid (>30 days remaining)
- 🟡 **Yellow**: Certificate expiring soon (<30 days)
- 🔴 **Red**: Certificate expired or expiring very soon (<7 days)
- ⚪ **Gray**: SSL disabled or no certificate

## 🛠 Manual Certificate Renewal

If automatic renewal fails, you can:
1. Go to Settings page
2. Click "Renew Certificate" button
3. Check the certificate status after renewal

## 🚨 Troubleshooting

### Certificate Not Issuing
- Verify domain DNS points to your server
- Ensure ports 80 and 443 are accessible from internet
- Check that domain is valid and publicly accessible

### Renewal Failures
- Check Let's Encrypt rate limits (5 failures per hour, 300 per week)
- Verify domain is still pointing to correct IP
- Use manual renewal button in Settings

### SSL Not Working
- Verify Caddy container is running: `docker-compose ps caddy`
- Check Caddy logs: `docker-compose logs caddy`
- Ensure firewall allows ports 80 and 443

## 🔐 Security Notes

- Certificates are automatically renewed 30 days before expiration
- All HTTP traffic is automatically redirected to HTTPS
- Certificate storage is persisted in Docker volumes
- Email is only used for Let's Encrypt notifications

## 📁 File Structure

```
pepperqc/
├── docker-compose.yml     # Updated with Caddy service
├── Caddyfile             # Basic HTTP configuration
└── SSL_SETUP.md          # This documentation
```

## 🔄 Migration from HTTP

If migrating from HTTP-only setup:
1. Update your bookmarks to use `https://`
2. Update any API integrations to use HTTPS endpoints
3. Telegram webhook URLs will automatically use HTTPS

## 📞 Support

For SSL-related issues:
1. Check certificate status in Settings page
2. Review Caddy container logs
3. Verify DNS configuration
4. Check Let's Encrypt status page for service issues