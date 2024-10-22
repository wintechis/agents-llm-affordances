<script setup lang="ts">
import { createBlock, ref } from 'vue';
import { DataFactory, Literal, Parser, Quad, Store } from 'n3';
import Spinner from 'vue-spinner-component/src/Spinner.vue';
import { RDF, MAZE } from '../namespaces';
const { namedNode, defaultGraph, quad } = DataFactory;

import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css'; //necessary styles for vue flow default
import '@vue-flow/core/dist/theme-default.css'; //additional "cool" styles for vue flow 

import { stigmergyCCRS, detectNeededActionCCRS, LMCCRS, getAccumulatedActionCosts } from '../strategies';

const mazeURI = ref("http://127.0.1.1:8080/maze");// provided URI of MAZE
const baseURI = ref("http://127.0.1.1:8080/");// provided URI of MAZE
var entryURI = ref('');//entry URI of maze
var exitURI = ref('');//target URI of maze

var route  = ref([""]); //array of URIs to get to target
var actions = ref([""]) //the necessyary links / actions to take to get from each node to the next
var planMsg = ref(''); //to display state of plan 

var running = ref(false); //simple flag to show that planner is running. used to show "Spinner"
var isHidden = ref(true); //flag to hide list of URIs the agent has to take
var CCRS = ref('stigmergyCCRS'); //to display state of plan  failCCRS
var insertErrorInPlanning = ref('no'); //if checked will manipulate planning of agent to contain a small error

var allTransitions : string[] = [] ; // The agent checks if the maze exposes maze:transitions and if so will remember them here

//Initilaize the costs with 0
var planningCost = 0; 
var executionCost = 0;
var origUris: string[], origPredicates: string[];

//We overwrite the usual fetch (which is the agent's action) to measure the cost during plan execution (but e.g. not GETs that are used during planning)
var actionFetch = new Proxy(window.fetch, {
    apply: function (target, that, args) {
      // Increase execution cost by one but forward request as usual
      executionCost++;
      let temp = target.apply(that, args);
      temp.then((res) => {
        // After completion of request
        if (res.status === 401) {
          alert("Session expired, please reload the page!");
        }
      });
      return temp;
    },
  });

//contains nodes of vue flow
var elements  = [
  {
    id: '0',
    position: { x: 50, y: 50 },
    label: 'Node 0',
  }, { id: 'e0-0', label: 'edge with arrowhead', source: '0', target: '0', markerEnd: MarkerType.ArrowClosed },
]

/**
 *
 * @param uri: the URI to strip from its fragment #
 * @return substring of the uri prior to fragment #
 */
function _stripFragment(uri) {
  const indexOfFragment = uri.indexOf("#");
  if (indexOfFragment !== -1) {
    uri = uri.substring(0, indexOfFragment);
  }
  return uri;
}

/**
 * Parse text/turtle to N3.
 * @param text text/turtle
 * @param baseIRI string
 * @return Promise ParsedN3
 */// @ts-ignore comment
async function parseToN3(text, baseIRI): Store{
  const store = new Store();
  const parser = new Parser({ baseIRI: _stripFragment(baseIRI), blankNodePrefix: '' }); // { blankNodePrefix: 'any' } does not have the effect I thought
  return new Promise((resolve, reject) => {
    // parser.parse is actually async but types don't tell you that.
    parser.parse(text, (error, quad, prefixes) => {
      if (error) reject(error);
      if (quad) store.addQuad(quad);
      else resolve(store);
    });
  });
}

/**Receives a string as message that will be displayed as planMsg and printed to console
* @param msg string message to be displayed and printed 
*/
function logPlanMsg(msg: string) {
  planMsg.value = msg
  console.log(msg)
}

/**Prints every quad of an N3 store as string to the console*/
function printStore(store : Store){
  for(const q of store){
    console.log(`${q.subject.value}   ${q.predicate.value}   ${q.object.value}`)
  }
}

/** 
 * * Backwards search from target to entry via a given map (AI modern approach, 4th ed., p. 368)
 * @param target Quad
 * @param entry Quad
 * @param nodes Quad[]
 * @return string[]
*/
function findRoute(target :Quad, entry: Quad, nodes : Store ) : string[]
{ 
  var route = [target.subject.value]; //initalize with last step, aka target

  //trivial case
  if(target === entry)
  {return route;}

  nodes.removeQuad(target);
  
  var options = nodes.getQuads(null, MAZE('north'), namedNode(target.subject.value), null);
  options = options.concat(nodes.getQuads(null, MAZE('west'), namedNode(target.subject.value), null));
  options = options.concat(nodes.getQuads(null, MAZE('south'), namedNode(target.subject.value), null));
  options = options.concat(nodes.getQuads(null, MAZE('east'), namedNode(target.subject.value), null));
  options = options.concat(nodes.getQuads(null, MAZE('exit'), namedNode(target.subject.value), null));

  
  if (options.find(e => e.subject.value === entry.subject.value)) {
    //if entry is in options, go directly there, end search
    route.push(entry.subject.value);
    return route;
  } else if (options.length > 0) {//options exist that are NOT the entry

    //remove options from possible nodes (??)
    for (const op of options) 
    { 
      nodes.removeQuad(op);
    }

    let arr : string[]= []

    /**for each option: 
     * recursive call function for each option again and again, until either 
     *  array with routes get returned, or 
     *  empty array (if empty array, also return empty array)*/
    for (const op of options) {
      arr = findRoute(op, entry, nodes);

      if(arr.length != 0)//route found
      {
        return (route = route.concat(arr)); //
      }
    }

    //no route found
    return [];


  } else {
  
    // no options left and entry was not already in there??
    //--> no path possible; return empty path
    return [];
  } 
  
}

function deleteVisuals()
{
  //"delete" by overwriting with a "basic" plan
  elements = [{ id: '0', position: { x: 50, y: 50 }, label: 'Node 0', }, { id: 'e0-0', label: 'edge with arrowhead', source: '0', target: '0', markerEnd: MarkerType.ArrowClosed },]
}

function resetVisuals() {
  //"reset" elements by making them white
  //elements = [{ id: '0', position: { x: 50, y: 50 }, label: 'Node 0', }, { id: 'e0-0', label: 'edge with arrowhead', source: '0', target: '0', markerEnd: MarkerType.ArrowClosed },]

  for(let e of elements)
  {// @ts-ignore comment
    e.class = "inactive"
  }

}

/**Query all possible transitions as exposed by the maze via the maze:transitions predicate*/
async function getAllTransitions(store:Store) {
  var allActions = Array.from(new Set((store.getObjects(namedNode(mazeURI.value), MAZE('transitions'), null))));
  for(const ac of allActions){
    allTransitions.push(ac.value);
  }
}

/**
 * Planning to find a course of actions to traverse the maze
 * Look for a map provided by the maze and then do backwards search over the provided cells and links to find a route to the defined exit
 */
async function startPlanning() {
  logPlanMsg("[Planner] Planning with BFS started")
  running.value = true;//triggers spinner to show that planning has started
  resetVisuals()
  var t0 = performance.now()
  planningCost++;
  
  var res = await fetch(new URL(mazeURI.value))

  var store = await parseToN3(await res.text(), mazeURI.value)// GET Maze 
  const containedRes = store.match(null, namedNode('http://www.w3.org/ns/ldp#contains'), null); //all contained resources in LDP container,
 
  for (const res of containedRes){
    const resResponse = await fetch(new URL(res.object.value)) //get resource
    const tempStore = await parseToN3(await resResponse.text(), res.object.value)// GET Maze 

    for(var quad of tempStore)
    {
      store.addQuad(quad)
    }

  }

  getAllTransitions(store);
    
  var mapURI = "";
  //store ought to contain map including all cells and a cell with rdfs:label "Exit" by now (or identify Exit by having only connections to maze:Walls?)
  for (const quad of store.match(null, namedNode(RDF("type")), namedNode(MAZE("Map")))){
    console.log(">> Map URI: " + quad.subject.value);
    mapURI = quad.subject.value;

  }

  //btw, getQuads on Stores returns an array of quads; match returns a stream (which seems to just complicate stuff...)
  //we assume only one entry and exit.
  const mazeEntry = store.getQuads(namedNode(mazeURI.value), namedNode("http://www.w3.org/1999/xhtml/vocab#start"), null, null); // determine an entry cell (via xhv:start relation)

  const entry = store.getQuads(namedNode(mazeEntry[0].object.value), null, null, null); //get entry cell triple (which also includes relations to other cells)
  const cell_to_exit = store.getQuads(null, MAZE('exit'), null, null); //get cell that leads to the exit (this cell links to the exit via maze:exit )
  const exit = store.getQuads(namedNode(cell_to_exit[0].object.value), null, null, null); //get exit cell triple


  console.assert(entry != null, "Entry is undefined")
  var entryCell = entry[0].subject.value
  console.log(">> Entry URI: " + entryCell);
  entryURI.value = entryCell; //for displaying on webpage
  
  console.assert(exit != null, "Exit is undefined")
  var exitCell = exit[0].subject.value
  exitURI.value = exitCell; //for displaying on webpage
  console.log(">> Exit URI: " +  exitCell);  
  
  //GET Map to mutate 
  var resMap = await fetch(new URL(mapURI))
  const mapTomutate = await parseToN3(await resMap.text(), mapURI)

  logPlanMsg("[Planner] Backwards search started");
  const routeInMaze = (findRoute(exit[0], entry[0], mapTomutate)).reverse();

  var actionsInMaze : string[]= []

  if(routeInMaze.length == 0)
  {
    logPlanMsg("[Planner] Backwards search found no route.");

  }else{
    logPlanMsg("[Planner] Found route in maze. Waiting for execution.");
    for (let i = 0; i < routeInMaze.length-1; i++) 
    { 
      var pred  = store.getQuads(namedNode(routeInMaze[i]), null, namedNode(routeInMaze[i+1]), null) //gets all quads 
      actionsInMaze.push(pred[0].predicate.value) //add to actions 
    }
    actionsInMaze.push("NOP"); //for last room, do nothing
  }

  route.value = routeInMaze;
  actions.value = actionsInMaze;

  var t1 = performance.now()
  console.log("[Planner] Backwards search took " + (t1 - t0) + " milliseconds.")

  running.value = false;

  let i = 0

  //setup nodes for diagram
  for (const r of routeInMaze)
  {
    let a = elements.length-1
    elements.push({
      id: String(a),
      position: { x: 0, y: i * 120 }, //Math.random() * 400
      label: r,
    })

    i++
  }

  elements.splice(0,1)//remove placeholder node...

  //deliberate ERROR for testing!
  if(insertErrorInPlanning.value == "yes"){
    if (actionsInMaze[1] == "https://kaefer3000.github.io/2021-02-dagstuhl/vocab#north"){
      actionsInMaze[1] = "https://kaefer3000.github.io/2021-02-dagstuhl/vocab#south"
    } else{
      actionsInMaze[1] = "https://kaefer3000.github.io/2021-02-dagstuhl/vocab#north"
    }
    
  }

  //setup actions for diagram
  for (var k = 0; k < actionsInMaze.length-1 ; k++)
  {
    elements.push({
      id: 'e'+k, label: actionsInMaze[k], source: String(k+1), target: String(k+2) , markerEnd: MarkerType.ArrowClosed
    })
  }  
}


function setElementClass(e , cl : string)
{
  if(e != undefined)
  {
    e.class = cl
  }
}


/** 
 * * Enacts a plan by following a list of URIs and trying to find connections there with predicates
 * @param uris : string[] that contains the list of uris that shall be reached, in order
 * @param predicates string[] that contains the links that connect the uris  (e.g. predicates[0] connects uris[0] and uris[1])
*/
async function executePlan(uris: string[], predicates: string[]) { 
  running.value = true;
  resetVisuals()
  var retryFlag = true;
  var t0 = performance.now() //for measuring performance
  //save plan that the agent started with to calculate plan stability distance after execution
  origUris = Object.assign([], uris);
  origPredicates = Object.assign([], predicates);

  outerLoop: for (let i = 0; i < uris.length; i++) {
    
    //Following scheme: GET uri[i] and try to find link with predicate[i] to get to uri[i+1]
    const uri = uris[i]; //current state
    const predicate = predicates[i]; //action that shall be taken according to plan
    const nextUri = (i != length-1) ? uris[i+1] : ""; //expectation according to  plan
    console.log(">>> Current state: " + uri)

    if(elements.find(k => k.label === uri) != null)
    {
        var e = elements.find(k => k.label == uri);
        setElementClass(e,'active')
    }

    try {
      // Make an HTTP GET request to the URI
      const response = await actionFetch(uri);
      
      if (response.status === 200) {
        // Parse the RDF data from the response from current resource and add it to the store
        const planStore = await parseToN3(await response.text(), mazeURI.value)
        var retryFlag = true; // indicates a retry for NetworkErrors that may happen with BOLD
        if(uri == exitURI.value){//request to target URI was successful
          logPlanMsg(`Reached exit. Execution finished.`)
          let e = elements.find(k => k.label == uri);
          setElementClass(e, 'done')
          calculateMetrics();
          break;
        }

        // Check if the predicate is present in the RDF data
        const subj = namedNode(uri);
        const pred = namedNode(predicate);
        const obj = namedNode(nextUri);

        const myQuad = quad(subj, pred, obj,defaultGraph() );

        if (planStore.has(myQuad)) {
          logPlanMsg(`Plan at ${uri} is acceptable, as has predicate ${predicate} to ${nextUri}.`)
          let e = elements.find(k => k.label == uri); 
          setElementClass(e,'done') //visuals: set element to class done (= green)
        } else {
          logPlanMsg(`Plan is NOT acceptable at ${uri} as cannot find predicate ${predicate} to ${nextUri}.`)
          
          let e = elements.find(k => k.label == uri); 
          setElementClass(e,'failed') //visuals: set element to class failed (= red)
          
          /**we could have ended up in a deadend, e.g. a lock, by randomly following links.
           * so the agents looks for environmental cues that could tell the agent how to continue.
           * We use as an environmental cue the environment's demand to send an HTTP request as defined by the lock resource
           * This is basically another CCRS: look for cues*/
          
          //check if environment wants some action performed
          if (CCRS.value != 'LanguageModelCCRS'){
            if(await detectNeededActionCCRS(planStore , uri, nextUri, uris, predicates) == true){
              //agent detected and applied an action, so retry
              i -= 1; //reduce iteration variable by one for retrying execution with new plan
              continue;
            }
          }
      
          /**
          HERE is where the decision about CCRS takes place. The agent has taken the map, planned something based on it, and started the execution.
          Unfortunately the ACTION (predicate) the agent wanted to perform (follow) is not applicable (does not match) to reach the planned world state (the following URI in the plan), e.g. because
           - the object of the (existing) triple is a different / unexpected one (= intended world state is unreachable from current one)
           - there is no triple with the matching predicate (= action is not applicable)
           */
          switch(CCRS.value)
          {
            ////////////////////////////////////////////////////////
            case 'LanguageModelCCRS':
              logPlanMsg(`[CCRS] Asking language model for advice.`)
              planningCost++; //increase planning cost

              //agent needs to know which predicates are allowed and which states are forbidden
              if (await LMCCRS(planStore, uri, nextUri, predicate, uris, predicates, [MAZE("north"), MAZE("south"), MAZE("east"), MAZE("west"), MAZE("green")], [MAZE("Wall")])) {
                
                //LLM detected and applied an action, so retry
                setElementClass(e, "corrected") 
                i -= 1; //reduce iteration variable by one for retrying execution with new plan
                continue;
                
              } else {
                //LLM did not find an applicable action
                break outerLoop;
              }
            ////////////////////////////////////////////////////////
            case 'stigmergyCCRS':
              logPlanMsg(`[CCRS] Using safe affordance.`)
              planningCost++; //increase planning cost
         
              if (stigmergyCCRS(planStore, uri, nextUri, MAZE("green"), uris, predicates)) {
                setElementClass(e,"corrected") //visuals: set element to class corrected 
                
                //i -= 1; //reduce iteration variable by one for retrying execution with new plan

                continue;
              } else {
                //we did not find the provided stigmergy mark to follow
                break outerLoop;
              }
            ////////////////////////////////////////////////////////
            case 'failedCCRS':
            default:
              logPlanMsg("[CCRS] Using Fail Strategy. Abort plan execution.");
              planningCost++; //increase planning cost as we basically used a strategy
              //end loop and fail.
              break outerLoop;      
          }

        }
        //--> Continue with the next URI in the plan array

      } else {       
        if (retryFlag == true) {
          logPlanMsg(`HTTP request to ${uri} returned an error: ${response.status} --> Retry`);
          i -= 1; //reduce iteration by one and retry once to mitigate random network errors...
          delay(750);
          retryFlag = false;
          continue;
        } else {
          logPlanMsg(`HTTP request to ${uri} returned an error: ${response.status}`);
          let e = elements.find(k => k.label == uri);
          setElementClass(e, 'failed') //visuals: set element to class faile (aka red)
          break; // Stop processing on error
        }
      }
    } catch (error) {
      let e = elements.find(k => k.label == uri);
      setElementClass(e, 'failed') //visuals: set element to class failed (aka red)
      if (retryFlag == true){
        logPlanMsg(`Network error at ${uri}: ${error.message}  --> Retry!`);
        i -= 1; //reduce iteration by one and retry once to mitigate random network errors...
        delay(500);
        retryFlag = false;
        continue; 
      }else{
        logPlanMsg(`Error while processing URI ${uri}: ${error.message}`);
        break; // Stop processing on error
      }
    }
  }

  var t1 = performance.now()
  console.log("Execution took " + (t1 - t0) + " milliseconds." )
  

  running.value = false;
}

//For debugging s.t. environment / BOLD may catch up
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Prints the agent's plan to the console e.g. for inspection or evaluation*/
function calculateMetrics()
{
  console.log("###################Printing Metrics###################")
  let costFromStrategies = getAccumulatedActionCosts();
  console.log(`Cost: ${planningCost + executionCost + costFromStrategies } = ${planningCost} (planning) + ${executionCost} (execution) + ${costFromStrategies} (strategies) `)
  
  //calculate the plan stabiltiy distance w.r.t. to original plan
  let origStore = new Store; //plan to hold the triples of the original plan
  let planStore = new Store; //plan to hold the triples of the final plan

  let inOrigButNotPlan = 0;
  let inPlanButNotOrig = 0;
  
  for(let k = 0; k < origUris.length-1; k++)  {
    origStore.addQuad(namedNode(origUris[k]), namedNode(origPredicates[k]), namedNode(origUris[k+1]));
  }
  for (let k = 0; k < route.value.length - 1; k++) {
    planStore.addQuad(namedNode(route.value[k]), namedNode(actions.value[k]), namedNode(route.value[k + 1]));
  }

  console.log("Actions in original plan, but not new plan:")
  for(const q of origStore){
    if(planStore.has(q)){
      continue;
    }else{
      console.log(q.subject.value+ " " + q.predicate.value+ " " + q.object.value)
      inOrigButNotPlan++;
    }
  }
  console.log("Actions in new plan, but not original plan:")
  for (const q of planStore) {
    if (origStore.has(q)) {
      continue;
    } else {
      console.log(q.subject.value + " " + q.predicate.value+ " " + q.object.value)
      inPlanButNotOrig++;
    }
  }

  let planStabiltyDistance = inOrigButNotPlan + inPlanButNotOrig;
  console.log(`Plan stability distance: ${planStabiltyDistance} = ${inOrigButNotPlan} + ${inPlanButNotOrig} `)

  //Reset metrics for new execution
  planningCost = 0;
  executionCost = 0;

}

</script>

<template>
  <h2>Agent entry point</h2>

  <p>Provide the agent's entry point to a maze. The agent will look for a map and start planning accordingly.</p>
  <input size="50" maxlength="75" v-model="mazeURI" placeholder="Type maze URI here">

  <div>
    <button @click="startPlanning">Use backwards search for planning</button>
    <button v-if="route[0] != ''" @click="executePlan(route,actions)">Execute Plan</button> <br>
    <p v-if="running == true">
      <spinner color="hsla(160, 100%, 37%, 1)" :size="20"></spinner>
    </p>
  </div>

  Applied strategy:
  <select v-model="CCRS">
    <option value="failedCCRS"
      title="If you cannot execute the plan anymore, abort the execution and do nothing else."
      selected>Fail</option>
    <option value="stigmergyCCRS"
      title="If you cannot execute the plan anymore, look for additional clues in your environment on how to proceed.">
      N3 ruleset</option>
    <option value="LanguageModelCCRS" title="Ask an LLM on how to proceed.">LLM</option>
  </select>

  Insert deliberate error in planning? <input type="checkbox" v-model="insertErrorInPlanning" true-value="yes"
    false-value="no" />

  <div v-if="entryURI != ''">
    Entry 🚪️: {{ entryURI }}
  </div>
  <div v-else>
    No entry.
  </div>
  <div v-if="exitURI != ''">
    Exit 📍️: {{ exitURI }}
  </div>
  <div v-else>
    No exit.
  </div>
  <div v-on:click="isHidden = !isHidden" v-if="route[0] != ''">
    <h3>Output: {{ planMsg }} </h3>

    <hr v-if="!isHidden">
    <ul v-if="!isHidden">
      <li v-for="item of route">{{ item }}</li>

    </ul>
  </div>
  <div v-else-if="route.length == 0">
    No route found 🚫️
  </div>

  <div style="height: 500px">
    <VueFlow v-model="elements" :snap-to-grid="true">
    </VueFlow>

  </div>

</template>