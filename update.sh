#!/bin/sh

curl 'https://mediathekviewweb.de/api/query' -H 'content-type: application/json' --data '{
  "queries": [
    {"fields": ["topic"], "query": "Films"},
    {"fields": ["channel"], "query": "ARTE.FR"}
  ],
  "sortBy": "timestamp",
  "sortOrder": "desc",
  "future": false,
  "offset": 0,
  "size": 1000
}' > /c/dev/p/MWJW/arte_fr.json

curl 'https://mediathekviewweb.de/api/query' -H 'content-type: application/json' --data '{
  "queries": [
    {"fields": ["topic"], "query": "Filme"},
    {"fields": ["channel"], "query": "ARTE.DE"}
  ],
  "sortBy": "timestamp",
  "sortOrder": "desc",
  "future": false,
  "offset": 0,
  "size": 1000
}' > /c/dev/p/MWJW/arte_de.json

curl 'https://mediathekviewweb.de/api/query' -H 'content-type: application/json' --data '{
  "queries": [
    {"fields": ["topic"], "query": "Spielfilm"},
    {"fields": ["channel"], "query": "3sat"}
  ],
  "sortBy": "timestamp",
  "sortOrder": "desc",
  "future": false,
  "offset": 0,
  "size": 1000
}' > /c/dev/p/MWJW/3sat.json
