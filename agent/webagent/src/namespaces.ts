"use strict";

/**
 * @param namespace uri 
 */
function Namespace(namespace: string) {
    return (thing?: string) => thing ? namespace.concat(thing) : namespace;
}

export const RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
export const RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#");
export const LDP = Namespace("http://www.w3.org/ns/ldp#");
export const XSD = Namespace("http://www.w3.org/2001/XMLSchema#");
export const MAZE = Namespace("https://kaefer3000.github.io/2021-02-dagstuhl/vocab#")
export const DYN = Namespace("https://paul.ti.rw.fau.de/~am52etar/dynmaze/dynmaze#")

export const HTTPM = Namespace("http://www.w3.org/2011/http#mthd")
export const HTTP = Namespace("http://www.w3.org/2011/http#")
export const PROV = Namespace("http://www.w3.org/ns/prov#")
