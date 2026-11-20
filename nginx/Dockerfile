FROM nginx:1.31-alpine

# Copy nginx config as template (will be processed by entrypoint)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

COPY nginx.base.conf /etc/nginx/nginx.conf

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]