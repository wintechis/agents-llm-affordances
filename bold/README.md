# BOLD Server LDP

A version of the Bold simulation server with support for Linked Data Platform. Forked from https://github.com/bold-benchmark/bold-server.

## Quickstart

Install the [LDP Sail](https://github.com/wintechis/ldp-sail).

To run the server:

```shell script
gradle install
cd build/install/bold-server
bin/bold-server
```

Then, go to http://localhost:8080 for a tutorial.

## Use maze environment for agents
After installing Bold, use the included properties (.properties files) and setup files (.trig files in ./data and .rq files in ./query) to create the maze environment. Execute the respective .sh files to run the environment.
Go to http://127.0.1.1:8080/maze to visit the maze.

