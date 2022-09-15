FROM node:16.13.0

# Create directory
RUN mkdir /token-lists
# Set work directory
WORKDIR /token-lists

COPY . ../token-lists

# Install dependencies
RUN npm install
RUN apt-get update
RUN apt-get install -y librsvg2-bin

# Run an application
CMD npm run start
