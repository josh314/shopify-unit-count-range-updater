FROM public.ecr.aws/lambda/nodejs:22

# Set working directory to project root (to keep file paths intact)
WORKDIR /var/task

# enable source maps for better debugging
ENV NODE_OPTIONS="--enable-source-maps"

COPY dist /var/task

# No CMD, we'll set that with the compose file