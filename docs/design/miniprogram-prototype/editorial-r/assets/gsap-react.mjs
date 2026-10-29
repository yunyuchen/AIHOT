/* esm.sh - @gsap/react@2.1.2 */
import{useEffect as x,useLayoutEffect as A,useRef as u}from"react";import h from"gsap";var c=typeof document<"u"?A:x,p=e=>e&&!Array.isArray(e)&&typeof e=="object",o=[],C={},m=h,y=(e,t=o)=>{let r=C;p(e)?(r=e,e=null,t="dependencies"in r?r.dependencies:o):p(t)&&(r=t,t="dependencies"in r?r.dependencies:o),e&&typeof e!="function"&&console.warn("First parameter must be a function or config object");let{scope:f,revertOnUpdate:d}=r,s=u(!1),n=u(m.context(()=>{},f)),g=u(a=>n.current.add(null,a)),i=t&&t.length&&!d;return i&&c(()=>(s.current=!0,()=>n.current.revert()),o),c(()=>{if(e&&n.current.add(e,f),!i||!s.current)return()=>n.current.revert()},t),{context:n.current,contextSafe:g.current}};y.register=e=>{m=e};y.headless=!0;export{y as useGSAP};
/*! Bundled license information:

@gsap/react/src/index.js:
  (*!
   * @gsap/react 2.1.2
   * https://gsap.com
   *
   * Copyright 2008-2025, GreenSock. All rights reserved.
   * Subject to the terms at https://gsap.com/standard-license or for
   * Club GSAP members, the agreement issued with that membership.
   * @author: Jack Doyle, jack@greensock.com
  *)
*/
//# sourceMappingURL=react.mjs.map