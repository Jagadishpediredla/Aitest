FROM node:18-slim

# Install tools needed for arduino-cli
RUN apt-get update && \
    apt-get install -y curl ca-certificates git unzip wget build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install Arduino CLI and move it to /usr/local/bin
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh \
    && mv /root/bin/arduino-cli /usr/local/bin/

# Update cores index and install some common cores
RUN arduino-cli core update-index \
  && arduino-cli core install arduino:avr \
  && arduino-cli core install esp32:esp32

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
