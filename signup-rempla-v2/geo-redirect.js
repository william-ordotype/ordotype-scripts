/**
 * Geographic Redirect for Signup Rempla V2
 * Hides body until geo check completes, then reveals
 * Must be loaded in header (blocking) to prevent flash
 */
(function(g,e,o,t,a,r,ge,tl,y,s){
    g.getElementsByTagName(o)[0].insertAdjacentHTML('afterbegin','<style id="georedirect1714398961109style">body{opacity:0.0 !important;}</style>');
    s=function(){g.getElementById('georedirect1714398961109style').innerHTML='body{opacity:1.0 !important;}';};
    t=g.getElementsByTagName(o)[0];y=g.createElement(e);y.async=true;
    y.src='https://g10498469755.co/gr?id=-Nwe80pRFRZ9lBcAfyJ-&refurl='+g.referrer+'&winurl='+encodeURIComponent(window.location);
    t.parentNode.insertBefore(y,t);y.onerror=function(){s()};
    georedirect1714398961109loaded=function(redirect){var to=0;if(redirect){to=5000};
    setTimeout(function(){s();},to)};
})(document,'script','head');
