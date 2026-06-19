FROM qgis/qgis-server:ltr

ENV TZ=UTC
ENV QGIS_PREFIX_PATH=/usr
ENV QGIS_SERVER_LOG_STDERR=1
ENV QGIS_SERVER_LOG_LEVEL=2

COPY project/project.qgz /home/qgis/project/project.qgz

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/local/bin/start-xvfb-nginx.sh"]
