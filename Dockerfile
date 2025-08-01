FROM node:20.19.4

# Create directory
RUN mkdir /token-lists
# Set work directory
WORKDIR /token-lists

COPY . ../token-lists

# Install dependencies
RUN apt-get update
RUN apt-get install -y librsvg2-bin
RUN apt-get install -y libimagequant-dev
RUN yarn 

# Run an application
CMD yarn run start
