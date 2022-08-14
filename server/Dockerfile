FROM node
WORKDIR /server
COPY package.json server.js ./
RUN apt-get update \
	&& apt-get install -y build-essential python3 python3-pip
RUN yarn install
COPY static ./static
EXPOSE 3001/tcp
EXPOSE 3001/udp
EXPOSE 2000-2020/tcp
EXPOSE 2000-2020/udp
CMD [ "node", "server.js" ]