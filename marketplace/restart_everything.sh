#!/bin/sh

docker compose down;
npm run rebuild:all;
nohup npm run dev:all > dev_nohup.out 2>&1 &
