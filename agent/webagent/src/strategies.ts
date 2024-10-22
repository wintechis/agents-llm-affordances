"use strict";

import { RDF, MAZE, RDFS, HTTP, XSD, PROV, DYN } from './namespaces';
import { Writer, DataFactory, Literal, Parser, Quad, Store, BlankNode } from 'n3';
const { namedNode, literal, defaultGraph, quad } = DataFactory;

var accumulatedActionCost = 0;

//We overwrite the usual fetch (which is the agent's action) to measure the cost during execution of strategies
var actionFetch = new Proxy(window.fetch, {
    apply: function (target, that, args) {
      // Increase execution cost by one but forward request as usual
      accumulatedActionCost++;
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

export function getAccumulatedActionCosts()
{return accumulatedActionCost;}

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

/**
 * Compare two arrays for equality
 * @param arr1 
 * @param arr2 
 */
function arraysAreEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }

  return true;
}

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
 * @param txt: takes txt as string and prints it with a "[CCRS] " before to the console
 */
function logCCRS(txt : string) {
  console.log("[CCRS] " + txt)
}


/** 
 * * Uses stigmergy to follow marks and try to mend failing plans
 * @param planStore : Store contains plan of Uris and predicates
 * @param uri: string current accessed Uri (= current "state")
 * @param nextUri :string Uri that should come next (=next "state")
 * @param predicate: string link between both staes (= "action" to be taken)
 * @param uris : string[] all planned states
 * @param preedicates : string[] all planned actions / transitions
*/
export function stigmergyCCRS(planStore : Store, uri: string, nextUri :string, stigmergyMark: string, uris: string[], predicates: string[]) {
    //1) see if the current state has the provided stigmergy mark
    //1.1) try to discover some suitable mark..? but how do stigmergy marks look like in hypermedia?...
    //1.2) what if our marks also use some kind of scent / strength  - that should be correct / or re-affirmed (if we have an active environment)
    
    var stigmergyCandidates = planStore.getObjects(namedNode(uri), namedNode(stigmergyMark), null)
    
    //2) if exists, follow, return true. if not, return false.
    if (stigmergyCandidates.length > 0) {

      //there exists at least one other candidate, so just take this one
      let newGoal = stigmergyCandidates[0].value
      
      //check if the mark shows towards where we already wanted to go - or not
      if(newGoal == nextUri){
        console.log(`[CCRS] Following ${stigmergyMark} as stigmergy mark to (already planned) ${nextUri}`);
        //uris[index] uses predicates[index] for a transition
        let index = uris.findIndex(u => u === uri);

        predicates[index] = stigmergyMark; //replace the planned transition with the new stigmergy mark
        
        //plan is now corrected at the current state and will try to use stigermgy to continue with rest of plan
        return true;
        
      }else{//stigmergy tells us to go to a completely new goal which was not planned before
        console.log(`[CCRS] Following ${stigmergyMark} as stigmergy mark to ${newGoal}`);
        
        //uris[index] uses predicates[index] for a transition
        let index = uris.findIndex(u => u === uri);

        /*
         given the stigmergy mark we are following now, the agent anticipates a new state - one that was not anticipated before
         we have now two possibilities:
          - A) scratch the whole plan and only follow the marks (in a SRA style fashion); 
          - B) try to salvage the plan
          
        Problems for A?
          If the environment cannot / does not want to provide marks anymore, we are lost - as we have scrapped the plan, we have no idea what to do 
            -> "then we do replanning" - but if we saw replanning as a viable option, then we shouldn't have used stigmergy in the first place, should we?
            -> "fail" - a valid but not a great strategy
            -> "random" - better idea, but only as last resort..?
        Problems for B?
          We have to change the plan fundamentaly; on the one hand we have to insert the new states and transitions, in the middle of the plan, but we do not
          know, what transitions to expect AFTER the state that results in following the stigmergy mark.
          On the other hand, we also have to keep the plan and always check, if we somehow reverted by chance back to the plan or some sub-plan of it 
          (e.g. a subplan that skipped a state and only contains the rest of the original plan until the target state)?
          */ 

        predicates[index] = stigmergyMark; 

        //check if new state is part of rest plan..? 
        //// if no, just insert and try to follow marks...
        //// if yes, remove everything from th plan before this state, as we assume we can enter the environemnt again at a later state where our plan succeed.
        ////// --> what if not. Then we try again for stigmergy. if again none: fail, as we want to avoid replanning (for now)

        let i = uris.findIndex(u => u === newGoal); //-1 means not found
        if((i != -1) && (i > index)){ //state has to be somewhere in the subsequent steps
          //if state was found and is in the future, shorten the plan (=cut out everything in between) to match the current perception
          uris.splice(index+1, (i-index)-1 ); 
          predicates.splice(index+1, (i-index)-1); 


        }else{
          uris.splice(index+1, 0, newGoal); //index+2 means it will be insertes at positib index+1
          predicates.splice(index+1, 0, "???"); //we cannot know what kind of actions are available at the next state
        }
        
        //plan could be corrected, continue with rest of plan
        return true;

      }
      
    }

    //plan could not be corrected
    console.log("[CCRS] Did not find alternative via safe affordance.");
    return false;
}


class Action {
  demandUri: string; //where the action was demanded
  demandClass : string; //what class an instance that holds the demanded value has
  property : string; //the property of an instance of the demanded class
  requestMethod : string; //which method is used for the action
  actionLocation : string; //where the action shall be applied to

  constructor();
  constructor(demUri?: string, demCla?: string, prop? : string, reqMthd? :  string, loc? : string) {
    this.demandUri = demUri ?? "";
    this.demandClass = demCla?? ""; //what class an instance that holds the demanded value has
    this.property = prop ?? ""; //the property of an instance of the demanded class
    this.requestMethod = reqMthd?? ""; //which method is used for the action
    this.actionLocation = loc?? "";
  }

 
 
}

var agentID = "";
//just invent and save some ID 
function getID(): string { 
  if(agentID == "" ){
    const randomNumber = Math.floor(Math.random() * 1001);
    agentID = `https://www.example.org/Ag${randomNumber}`
  }
  return agentID ;
}

/** 
 * Try to detect demanded actions in envrionment and execute them
 * @param planStore : Store contains plan of Uris and predicates
 * @param uri: string current accessed Uri (= current "state")
 * @param nextUri :string Uri that should come next (=next "state")
 * @param uris : string[] all planned states
 * @param predicates : string[] all planned actions / transitions
*/
export async function detectNeededActionCCRS(planStore : Store, uri: string, nextUri :string, uris: string[], predicates: string[]) {
  logCCRS("Look for needed action.")
  var committedAction = new Action();

  //search for all resources that NEED some action done
  searchLoop: for(const needsActionAtURI of planStore.getSubjects(DYN("needsAction"), null, null)){

    // the resource tells us that it wants at least one action performed
    actionLoop: for(const needsActionObject of planStore.getObjects(needsActionAtURI, DYN("needsAction"), null) ) {
      //check exposed demands and if they are already done..?
      if(planStore.has(new Quad(needsActionObject,namedNode(DYN('hasStatus')),namedNode(DYN('done'))))){
        console.log("I DID NOT CONSIDER, because demand is DONE: " + needsActionObject.value)
        continue;
      }
      console.log("I CONSIDER, because demand is still OPEN: " + needsActionObject.value)
        
      //get demanded request - we assume only ONE triple per request; 
      const neededRequestMethod =  planStore.getObjects(needsActionObject, HTTP("mthd"), null)[0] 
      
      const neededRequestBody = planStore.getObjects(needsActionObject, HTTP("body"), null)[0]  
      const neededRequestLocation = planStore.getObjects(needsActionObject, HTTP("requestURI"), null)[0]  
      
      const neededBodyClass = planStore.getObjects(neededRequestBody, DYN("foundAt"), null)[0] 
      const neededBodyProperty = planStore.getObjects(neededRequestBody, DYN("needsProperty"), null)[0]

      logCCRS("Considered demand: " + neededRequestMethod.value + " with " + neededBodyProperty.value + ", found at " + neededBodyClass.value)

      //check if we already know something the environment could demand
      const classCandidates = planStore.getSubjects(RDF("type"), neededBodyClass, null)

      //for every demanded action, we will either try to perform it, or search for a solution (= create a stigmergy mark to inform other agents, then start search)
      if(classCandidates.length >0 ){
        for(const classCandidate of classCandidates){
          const propertyCandidates = planStore.getObjects(classCandidate, neededBodyProperty, null)
          for(const propertyCandidate of propertyCandidates){
            await applyAction(neededRequestLocation, neededBodyProperty, propertyCandidate, neededBodyClass, neededRequestMethod)
          }
        }
        
        //if environment is slower than agent (aka BOLD needs time to unlock the lock); "true" just tells the agent to go back and retry..
        return true; //is this sufficient to just try again..? guess so.

      }else{
        //we have nothing that we could offer to the environment, so we have to search
        logCCRS("No suitable candidates found for action "+ neededBodyClass.value +": starting search")              
        
        //0 - check if somebody is already caring about that and if agent (YOU) are already busy
        const stigmergyMarks = planStore.getSubjects(RDF("type"), PROV("Activity"), null);
        stigmergyLoop: for(const stigmergyMark of stigmergyMarks){

          //check that stigmergy mark is about current considered action / class
          if(planStore.has(new Quad(stigmergyMark, namedNode(PROV('used')), namedNode(neededBodyClass.value) ) ))
          {
            //all stigmergy mark we consider for the class are by definition maze:open, as only actions and their classes arrive here that NOT maze:done (see above) 
            logCCRS("Found affordance link for " + neededBodyClass.value)
            
            //check who already cares about the action
            for(const associatedAgent of planStore.getObjects(stigmergyMark,namedNode(PROV('wasAssociatedWith')),null)){
              //there SHOULD be only one triple denoting an associated agent
              if(associatedAgent.value == getID()){
                //this the stigmergy mark denotes ME and the action is not done, so I continue to search for a solution
                logCCRS("I am already searching according to " + stigmergyMark.value)
                break stigmergyLoop;
              }else{
              //somebody else cares about this. skip.
                logCCRS(`${associatedAgent.value} already searching according to ` + stigmergyMark.value)
                continue actionLoop;
            }
            }
          }
        }

        //1 - nobody is caring about this particular action? Create OWN stigmergy mark to say that search is underway!
        const writer = new Writer(); 
        writer.addQuad(writer.blank([{ //blank node for stigmergy mark? 
            predicate: namedNode(PROV("wasAssociatedWith")),
            object:    namedNode(getID()), 
          },{
            predicate: namedNode(PROV('startedAtTime')),
            object:    literal(new Date().toISOString(), namedNode(XSD("dateTime")),), //now
          },{
            predicate: namedNode(PROV('used')),
            object:    namedNode(neededBodyClass.value), 
          }]), namedNode(RDF("type")), namedNode(PROV("Activity"))) 
          

        let stigmergybodyTxt = ""
        writer.end((error, result) => stigmergybodyTxt = result);
        logCCRS("Create note for " + neededBodyClass.value + "'s " + neededBodyProperty.value + " needed at " + needsActionAtURI.value)

        try {
          //Agent creates stigmergy mark to commit to searching for key
          let resp = await actionFetch(new URL(needsActionAtURI.value).pathname.toString(), { //extract pathname as we use a proxy 
            method: 'POST', headers: {'Content-Type': 'text/turtle' },
            body: stigmergybodyTxt
          })
          console.log(resp.status)
          
          //After agent commits to search for action, save what the agent needs to search
          committedAction.demandUri = needsActionAtURI.value
          committedAction.demandClass = neededBodyClass.value
          committedAction.property = neededBodyProperty.value
          committedAction.requestMethod = neededRequestMethod.value
          committedAction.actionLocation = neededRequestLocation.value

          break searchLoop; //end search for any actions as agent comitted for an action

        } catch (error) {
          console.log(error) 
        }
      }
    }
    
  }
  
  //if we comitted to a demanded action, try to find and perform it
  if(committedAction.demandUri != "")
  {
    let resultStore = await simpleBFS([committedAction.demandUri], committedAction.demandClass,  [MAZE("north"), MAZE("south"), MAZE("east"), MAZE("west")])
    for(const subj of resultStore.getSubjects(RDF("type"),namedNode(committedAction.demandClass),null)){
      for(const soughtValue of resultStore.getObjects(subj,namedNode(committedAction.property), null )){
        let didExecute = await applyAction(namedNode(committedAction.actionLocation), namedNode(committedAction.property), soughtValue, namedNode(committedAction.demandClass), namedNode(committedAction.requestMethod))
        
        if(didExecute = true)
        {
          logCCRS("Executed Action - we'll now wait a bit :)") 
          await delay(4000) //BOLD needs time for SPARQL
          return true;
        }
      }
    }
  }

  return false; //agent did either found no action or could not apply any action; thus proceed with other strategies
}

//For debugging s.t. environment / BOLD may catch up
function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

/** Breadth-First-Search to look for an object of a given class (used to find keys) */
async function simpleBFS(initialURIs: string[], searchedClass : string, allowedPredicates : string[]): Promise<Store> {

  var visitedURIs: Set<string> = new Set();
  var queue: string[] = [...initialURIs];
  logCCRS("Starting BFS AT "+ initialURIs[0])

  while (queue.length > 0) {
    const currentURI = queue.shift()!;
    
    if (!visitedURIs.has(currentURI)) {
      visitedURIs.add(currentURI);

      logCCRS("Now visiting "+ currentURI)

      try {
        //const response = await fetch(currentURI);
        const response = await actionFetch(currentURI);
        
        const body = await response.text();
        
        // Check if the response body contains the target triple
        const store = new Store();
        store.addQuads(new Parser().parse(body));
        
        if (store.getQuads(null , RDF("type"), namedNode(searchedClass), null).length > 0 ) {
          return store;
        }
        
        // Extract new URIs from the response
        let newURIs : string[] = [];
        for(const allowedPredicate of allowedPredicates){
          for(const newURI of store.getObjects(null, namedNode(allowedPredicate), null)){
            newURIs.push(newURI.value)
            logCCRS("Add to queue: "+ newURI.value)
          }
        }
        
        // Add new URIs to the queue
        queue.push(...newURIs);
      } catch (error) {
        logCCRS("Visiting "+ currentURI + " returned error, skip!")
      }
    }
  }
 
  return new Store() ; //nothing found, so return new and empty store
}

/**
 * @param neededRequestLocation - URI for action
 * @param neededBodyProperty - Predicate for body
 * @param soughtValue - Object value
 * @param neededBodyClass - Information derived from certain class
 * @param neededRequestMethod - Request method
 * @returns True if action was executed (!= it was succesful...)
 */
async function applyAction(neededRequestLocation, neededBodyProperty, soughtValue, neededBodyClass, neededRequestMethod) : Promise<Boolean> {
    
  const writer = new Writer();
  writer.addQuad(namedNode(neededRequestLocation.value), namedNode(neededBodyProperty.value), soughtValue)
  
  let bodyTxt = ""
  writer.end((error, result) => bodyTxt = result);
  logCCRS("Action for "+ neededBodyClass.value +": " + neededRequestMethod.value.split('#')[1] +" to "+ neededRequestLocation.value +": " + bodyTxt)

  try {
    //extract pathname as we use a proxy here. Thanks CORS.
    let resp = await actionFetch(new URL(neededRequestLocation.value).pathname.toString(), { 
      method: neededRequestMethod.value.split('#')[1] , headers: {'Content-Type': 'text/turtle' },
      body: bodyTxt
    })
    console.log(resp.status)
    return true;
  } catch (error) {
    console.log(error)
    return false;
  }
}

/** 
 * * Uses random walk to try to mend failing plans
 * @param planStore : Store contains plan of Uris and predicates
 * @param uri: string current accessed Uri (= current "state")
 * @param nextUri :string Uri that should come next (=next "state")
 * @param predicate: string link between both states that was expected (= "action" to be taken)
 * @param uris: the course of planned states
 * @param predicates: the course of planned actions
 * @param allowedPredicates : string array for links that are allowed to be used if no other link to nextUri can be found. If empty, all possibilities are allowed.
 * @param prohibitedStates : string arrayy for states that shall be ignored when randomly followind links
 * @returns true if alternative was found, false if not
*/
export async function LMCCRS(planStore : Store, uri: string, nextUri :string, predicate: string, uris :string[], predicates : string[], allowedPredicates : string[] = [], prohibitedStates : string[] = [] ) {
    //1. build a prompt based on the current map / perception?
  //get all info on map, entry, and exit
  logCCRS("Asking LLM")
  var t0 = performance.now()  
  
  //check either for affordance or stigmergy 
  var helpfulInfo = await detectActions(planStore , uri, nextUri, uris, predicates)
  var helpfulInfoString = ""
  if(helpfulInfo.length >0)
  {
    //planStore.addQuads(new Parser().parse(helpfulInfo));
    for(const quad of helpfulInfo){
      //planStore.addQuad(quad.subject, quad.predicate, quad.object); ///... why would we add the helpful info to the store again..??
      helpfulInfoString += `${quad.subject.value} ${quad.predicate.value} ${quad.object.value} .\n`
    }
  }
  console.log(helpfulInfoString);
  

  //as the SLM is prone to produce output not formatted as intended, we ask the SLM to mark the found path with tags
  let beginTag = "###PATH"
  let endTag = "###END"

  var cellBody = ``
  for (const q of planStore){
    if (q.predicate.value == RDFS('label')){continue;} //skip triples with labels to not confuse SLM
    cellBody += "<" + q.subject.value + "> <" + q.predicate.value + "> <" + q.object.value + "> .\n"
  }

  var planString = "The following is a small part of the plan:\n"
  let index = uris.findIndex(u => u === uri);
  for(var x=(index-2 < 0 ? 0 : index-2); x < index+2; x++){ 
    planString += `${x+1}. at ${uris[x]} I follow ${predicates[x]} to ${uris[x+1]} \n`
  }

allowedPredicates = allowedPredicates.map((data) => data = "- " + data + "\n"); 

var promptBody = `You are assisting a Web agent navigating through a maze represented by connected web resources in RDF format. The agent receives a plan that consists of triples, each indicating a direction to follow from one URI (cell) to another URI (cell) using specific predicates. The predicates used for directions are:
${allowedPredicates}

The agent traverses the maze using HTTP GET requests to move between cells and HTTP POST requests to manipulate cells. 
The agent can only move to a cell if there is a valid triple connecting the current cell to the next cell. The resource ${prohibitedStates} is inaccessible.

The agent is currently following a plan but has encountered an issue. Your task is to provide the next step for the agent based on the provided plan, the last retrieved resource, and a set of available triples for potential HTTP requests.

For a GET request:
- You may suggest only one triple.
- The triple must exist in the "Last Retrieved Resource".
- Follow the <https://kaefer3000.github.io/2021-02-dagstuhl/vocab#green> predicate when the plan fails

For a POST request:
- You may suggest multiple triples.

Plan:
${planString}

Last Retrieved Resource:
${cellBody}

The agent is unsure how to proceed next. Obviously, the has plan failed. Should it perform a GET or a POST request?

${(helpfulInfoString == "") ? "" : "The following triples must be used for a POST requests:\n" + helpfulInfoString}

Before your answer print "${beginTag}", after your answer, print "${endTag}".
Please provide the next step for the agent in the following format and print nothing more:
1. HTTP Method: [GET or POST]
2. If GET:
    - URI: [Next resource URI]
    - Triple: [Subject Predicate Object]
3. If POST:
    - URI: [Resource URI to send POST request]
    - Triple: [Subject Predicate Object to unlock the cell]`

  console.log(promptBody)

  //2. send prompt to LLM
  console.log("Sending request to LLM (" + new Date( Date.now()).toLocaleString() +").")
  var body = "";
  try {
    
    //#### Online variant: #####
    let resp = await actionFetch('/llm/single', { //redirected via proxy to localhost:3000 and then forwarded to LLM
      method: 'POST',
      body: promptBody
    })
    body = await resp.text();

  } catch (error) {
    console.error("Error on sending to LLM - did you forward the port ?")
    console.log(error)    
    return;
  }
  console.log(`Received answer (took ${((performance.now() - t0) / 1000.0).toFixed(2) } sec)`)
  
  //3. extract path from answer
  console.log(body)
  var ans : any[] = [];
  
  ans = extractParts(body);
  
  let mthd = ans[0];
  ans[1] = ans[1].replace(/"/g, "").replace(/</g,'').replace(/>/g,'').replace(/\.$/, "").trim(); //uri cleanup
  let reqUri = ans[1]
  console.log(mthd) //method
  console.log(reqUri) //uri
  
  //clean up, remove leading or trailing whitespaces
  ans[2] = ans[2].map((data) => data = data.replace(/"/g, "").replace(/</g,'').replace(/>/g,'').replace(/\.$/, "").trim()); 
  ans[2] = ans[2].filter((elem, ind) => elem.length > 0); //remove empty elements
  
  console.log(ans[2]) //uri

  
  if(  ans[2].length == 0 ){
    throw new Error("[LLM] LLM returned did not send object");
  }

  console.log(`[LLM] ${mthd} to ${reqUri}`)
  
  //agent has the choice: either execute action (PUT/POST) and retry by looking for effect, or go somewhere else (GET)
  if(mthd=="GET"){
    var bodyStore = new Store()

    console.log(ans[2])

    for(const elem of ans[2]){
      var triples = elem.split(" ")
      if(triples.length == 2){
        //bodyStore.addQuad(namedNode(ans[1]), namedNode(elem.split(" ")[0]), (isValidURL(elem.split(" ")[1]) ? namedNode(elem.split(" ")[1]) : literal(elem.split(" ")[1])) );
        bodyStore.addQuad(namedNode(uri), namedNode(elem.split(" ")[0]), (isValidURL(elem.split(" ")[1]) ? namedNode(elem.split(" ")[1]) : literal(elem.split(" ")[1])) );
      }else if(triples.length == 3){
        bodyStore.addQuad(namedNode(uri), namedNode(elem.split(" ")[1]), (isValidURL(elem.split(" ")[2]) ? namedNode(elem.split(" ")[2]) : literal(elem.split(" ")[2])) );
      }
    }
    
    //there should be exactly ONE tripel in this store
    let nextCalculatedPredicate = ""
    let nextCalculatedUri = ""
    
    for(const q of bodyStore.getQuads(namedNode(uri),null,null,null)){
        console.log("LLM - GET with " + q.subject.value + " " + q.predicate.value + " " + q.object.value + " .");
        nextCalculatedPredicate = q.predicate.value
        nextCalculatedUri = q.object.value
        break; 
    }
    
    let index = uris.findIndex(u => u === uri);
    
    //next target is same, but predicate probably changed
    if(uris[index+1] == nextCalculatedUri) {
      predicates.splice(index, 1, nextCalculatedPredicate); //update predicate
      logCCRS(`[LLM] Updated plan with ${uri} ${nextCalculatedPredicate} ${nextCalculatedUri}.`)
      return true; //adapted plan, retry
    } else {
      //new target
      let i = uris.findIndex(u => u === nextCalculatedUri); //-1 means not found

      if((i != -1) && (i > index)){ //state has to be somewhere in the subsequent steps
        //if state was found and is in the future, shorten the plan (=cut out everything in between) to match the current perception
        uris.splice(index+1, (i-index)-1 ); 
        predicates.splice(index, (i-index),nextCalculatedPredicate); 
        //predicates.splice(index+1, (i-index)-2,nextCalculatedPredicate);  //??
        
        logCCRS(`[LLM] Insert into plan ${uri} ${nextCalculatedPredicate} ${nextCalculatedUri}. (updated predicate!)`)
      }else{
        //if state is unknown, insert new state and predicate
        uris.splice(index+1, 0, nextCalculatedUri); 
        predicates[index] = nextCalculatedPredicate;  //overwrite current one
        predicates.splice(index+1, 0, "???"); //insert placeholder as we cannot know
        
        logCCRS(`[LLM] Insert into plan ${uri} ${nextCalculatedPredicate} ${nextCalculatedUri}. (new state!)`)
      }

      return true
    }
    

    console.log("[LLM] Chosen next URI not possible.");
    return false;


  }else if(mthd=="POST" || mthd=="PUT"){
    //see if you have the "object" that LLM wants you to send
    //send everything you got to the specified request URI

    var bodyStore = new Store()

    for(const elem of ans[2]){
    
      var triples = elem.split(" ")
      if(triples.length == 2){
        bodyStore.addQuad(namedNode(ans[1]), namedNode(elem.split(" ")[0]), (isValidURL(elem.split(" ")[1]) ? namedNode(elem.split(" ")[1]) : literal(elem.split(" ")[1])) );
      }else if(triples.length == 3){
        bodyStore.addQuad(namedNode(ans[1]), namedNode(elem.split(" ")[1]), (isValidURL(elem.split(" ")[2]) ? namedNode(elem.split(" ")[2]) : literal(elem.split(" ")[2])) );
      }
    }
    
    for(const q of bodyStore){
        console.log(q.subject.value + " " + q.predicate.value + " " + q.object.value + " .");
    }
      
    for(const q of bodyStore){      

      console.log(`body: <${q.subject.value}> <${q.predicate.value}> ${isValidURL(q.object.value) ? "<"+q.object.value+">" : '"'+q.object.value.replace(/"/g, "")+'"'} .`)
      
      try {
        let resp = await actionFetch(new URL(reqUri).pathname.toString(), 
          { 
            method: mthd , headers: {'Content-Type': 'text/turtle' },
            body: `<${q.subject.value}> <${q.predicate.value}> ${isValidURL(q.object.value) ? "<"+q.object.value+">" : '"'+q.object.value.replace(/"/g, "")+'"'} .`
          }
        )
      } catch (error) {
        console.log("LLM action had a little error: " + error)
        continue;
      }

      logCCRS("[LLM] Executed Action - we'll now wait a bit :)") 
      await delay(3000) //BOLD needs time for SPARQL
    }
  }else{
    //LLM garbled something... 
  }
  return true; //LLM told us action, so agent retries
}

function extractParts(input: string): [string, string, string[]] {
    // Extract the part between ###PATH and ###END
    const pathContent = input.match(/###PATH([\s\S]*?)###END/)?.[1];
    if (!pathContent) {
        throw new Error("###PATH section not found");
    }

    // Extract the Method
    const methodMatch = pathContent.match(/HTTP Method:\s*(\S+)/);
    const method = methodMatch ? methodMatch[1] : '';

    // Extract the Request URI
    const uriMatch = pathContent.match(/URI:\s*(\S+)/);
    const requestURI = uriMatch ? uriMatch[1] : '';

    // Extract the Object lines
    //const objectMatch = pathContent.match(/Triples:\s*([\s\S]*)/);
    const objectMatch = pathContent.match(/Triple[s]?:\s*([\s\S]*)/);
    const object = objectMatch ? objectMatch[1].trim().split('\n') : [];

    return [method, requestURI, object];
}

function isValidURL(string) {
  var res = string.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
  return (res !== null)
};

/**This function is _similar_ to the agents usual CCRS to execute affordances, BUT differs! 
 * Here, the agent will only try to recognize affordances and look for "helpful Info" that can solve the affordance. The execution is done at some other place (e.g. by the LLM)
 */
async function detectActions(planStore : Store, uri: string, nextUri :string, uris: string[], predicates: string[]) {
  var committedAction = new Action();


  //search for all resources that NEED some action done
  searchLoop: for(const needsActionAtURI of planStore.getSubjects(DYN("needsAction"), null, null)){

    // the resource tells us that it wants at least one action performed
    actionLoop: for(const needsActionObject of planStore.getObjects(needsActionAtURI, DYN("needsAction"), null) ) {
      //check exposed demands and if they are already done..?
      if(planStore.has(new Quad(needsActionObject,namedNode(DYN('hasStatus')),namedNode(DYN('done'))))){
        console.log("I DID NOT CONSIDER, because demand is DONE: " + needsActionObject.value)
        continue;
      }
      console.log("I CONSIDER, because demand is still OPEN: " + needsActionObject.value)
        
      //get demanded request - we assume only ONE triple per request; 
      const neededRequestMethod =  planStore.getObjects(needsActionObject, HTTP("mthd"), null)[0] 
      
      const neededRequestBody = planStore.getObjects(needsActionObject, HTTP("body"), null)[0]  
      const neededRequestLocation = planStore.getObjects(needsActionObject, HTTP("requestURI"), null)[0]  
      
      const neededBodyClass = planStore.getObjects(neededRequestBody, DYN("foundAt"), null)[0] 
      const neededBodyProperty = planStore.getObjects(neededRequestBody, DYN("needsProperty"), null)[0]

      logCCRS("Considered demand: " + neededRequestMethod.value + " with " + neededBodyProperty.value + ", found at " + neededBodyClass.value)

      //check if we already know something the environment could demand
      const classCandidates = planStore.getSubjects(RDF("type"), neededBodyClass, null)

      //for every demanded action, we will either try to perform it, or search for a solution (= create a stigmergy mark to inform other agents, then start search)
      if(classCandidates.length >0 ){
        for(const classCandidate of classCandidates){
          const propertyCandidates = planStore.getObjects(classCandidate, neededBodyProperty, null)
          for(const propertyCandidate of propertyCandidates){
            await applyAction(neededRequestLocation, neededBodyProperty, propertyCandidate, neededBodyClass, neededRequestMethod)
          }
        }
        
        let helpfulInfos : Quad[] = []
        return helpfulInfos; //found no action or nothing helpful

      }else{
        //we have nothing that we could offer to the environment, so we have to search
        logCCRS("No suitable candidates found for action "+ neededBodyClass.value +": starting search")              
        
        //0 - check if somebody is already caring about that and if agent (YOU) are already busy
        const stigmergyMarks = planStore.getSubjects(RDF("type"), PROV("Activity"), null);
        stigmergyLoop: for(const stigmergyMark of stigmergyMarks){

          //check that stigmergy mark is about current considered action / class
          if(planStore.has(new Quad(stigmergyMark, namedNode(PROV('used')), namedNode(neededBodyClass.value) ) ))
          {
            //all stigmergy mark we consider for the class are by definition maze:open, as only actions and their classes arrive here that NOT maze:done (see above) 
            logCCRS("Found affordance for " + neededBodyClass.value)
            
            //check who already cares about the action
            for(const associatedAgent of planStore.getObjects(stigmergyMark,namedNode(PROV('wasAssociatedWith')),null)){
              //there SHOULD be only one triple denoting an associated agent
              if(associatedAgent.value == getID()){
                //this the stigmergy mark denotes ME and the action is not done, so I continue to search for a solution
                logCCRS("I am already searching according to " + stigmergyMark.value)
                break stigmergyLoop;
              }else{
              //somebody else cares about this. skip.
                logCCRS(`${associatedAgent.value} already searching according to ` + stigmergyMark.value)
                continue actionLoop;
            }
            }
          }
        }
        try {
          
          //After agent commits to search for action, save what the agent needs to search
          committedAction.demandUri = needsActionAtURI.value
          committedAction.demandClass = neededBodyClass.value
          committedAction.property = neededBodyProperty.value
          committedAction.requestMethod = neededRequestMethod.value
          committedAction.actionLocation = neededRequestLocation.value

          break searchLoop; //end search for any actions as agent comitted for an action

        } catch (error) {
          console.log(error) 
        }
      }
    }
    
  }
  
  //if we comitted to a demanded action, try to find useful info
  if(committedAction.demandUri != "")
  {
    let resultStore = await simpleBFS([committedAction.demandUri], committedAction.demandClass,  [MAZE("north"), MAZE("south"), MAZE("east"), MAZE("west")])

    //let helpfulInfos = ""
    let helpfulInfos : Quad[] = []

    for(const subj of resultStore.getSubjects(RDF("type"),namedNode(committedAction.demandClass),null)){
      //for(const soughtValue of resultStore.getObjects(subj,namedNode(committedAction.property), null )){
      //  helpfulInfos += `${subj.value} ${committedAction.property} ${soughtValue.value}`

      for(const quad of resultStore.getQuads(subj,null, null, null )){
        //helpfulInfos += ` ${quad.subject.value}> ${quad.predicate.value}> ${quad.object.value} .`
        helpfulInfos.push(quad)


      }
    }
    
    return helpfulInfos;

  }

  let helpfulInfos : Quad[] = []
  return helpfulInfos; //found no action or nothing helpful
}