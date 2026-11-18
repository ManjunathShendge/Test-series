FROM node:22.23.5-bookworm-slim
RUN npm install --global firebase-tools@15.36.0
WORKDIR /emulator
COPY firebase.json .
RUN mkdir /data && chown node:node /data /emulator
USER node
EXPOSE 9099 4000
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-exam-prep", "--import", "/data", "--export-on-exit", "/data"]
