# Adaptive Planning on the Web: Using LLMs and Affordances for Web Agents
We investigated the adaption of agents using plans on the Web despite its large and dynamic nature, as well as agents' constrained perception.
Built on Semantic Web technologies and affordances, we compared how agents choose appropriate actions to adapt to their environment either by condition-action rules or large language models. We conducted experiments on execution costs and plan stability distance to see whether agents would choose appropriate actions to adapt their plans.
We found that the costs and stability of rule-based and LLMs are close together, while performance differs greatly.

Our environments build on the Mike's Mazes environment (cf. https://github.com/mamund/2021-02-dagstuhl).

# Agent:
- mazePlanner : vue.js app with an agent that uses plans to navigate a maze. If its plan fails, the agent looks for alternative actions based on affordances as exposed by the maze
- agents can run either in "N3 ruleset", "LLM" strategy, or "Fail". In the both former cases they recognize affordances, but the execution is handled either by N3 or an LLM. In the latter case, the agent just fails whenever it runs into a deviation.

# Maze environments (BOLD+ldfu):
- setup-*.sh : initalizes and runs BOLD with differenz maze sizes, either small (5x5), mid (50x50), or big (250x250)
	- the use of affordances is activated in the .sh files
- data/*.trig : contains the description of cells and their connections for the different mazes. The entry is linked via xhv:start, the exit via maze:exit
- ldfuPrograms : contains N3 programs for ldfu to unlock cells and manipulate connections.
