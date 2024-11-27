FROM node:22

# Install specific version of Deno (v1.44.4)
RUN curl -fsSL https://deno.land/install.sh | sh -s v1.44.4

ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Set working directory
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8000

# Start development server
CMD ["npm", "run", "dev"]
