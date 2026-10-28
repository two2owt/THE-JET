# Architecture rules

- Notification reads share only simultaneous identical requests, keyed by user and query; do not cache settled results so read-state and push refreshes stay fresh.