FROM node:lts-slim

# Create directory
RUN mkdir /token-lists
# Set work directory
WORKDIR /token-lists

COPY . .

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends librsvg2-bin libimagequant-dev pkg-config libpng-dev git gcc make ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV ACTIONS_OR_CI_BUILD=1
RUN yarn install

# Run an application
CMD ["yarn", "run", "start"]
