# The maze agent
This is the agent that traverses our maze environments. 
The agent uses plans to navigate the maze and may adapt its plan if they become incorrect. 
The agent tries to find actions that help it adatp by using either
- a ruleset given in N3 rules
- Llama3 (queried via HTTP POST)
- Gemma2 (queried via HTTP POST)
- Qwen2 (queried via HTTP POST)

We use vue.js together with [N3.js](https://github.com/rdfjs/n3.js) to implement the agent in TypeScript.

Note that we used models running with ollama on a separate device, which we do not include in our repo, so you have to setup your own models.

## Setup

First, setup BOLD for a chosen maze environments (see BOLD folder). Afterwards, start the agent with

```shell script
npm run dev
```
and go to http://localhost:5173/ where you find a simple interface to start and run the agent, including choosing how to plan for the mazeand what strategy to apply, if the plan fails.

We provide a small visualization of the current state of the plan as graph. Most output of the agent is printed to the developer console to keep the interface simple (view e.g. in Firefox by pressing F12).
