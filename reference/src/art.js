/* ================= ART: object stickers, house, host =================
   Every object is a <symbol> on a 120x120 box, lit from the top-left.
   Mark vocabulary: flat base fill, rim shade (same shape offset -6,-6 inside a clip),
   one white highlight, 4px ink outline. Nothing else. */
var K='#0E0B2B';
function rp(d){return d;}
function E(cx,cy,rx,ry){return 'M'+(cx-rx)+' '+cy+'A'+rx+' '+ry+' 0 1 0 '+(cx+rx)+' '+cy+'A'+rx+' '+ry+' 0 1 0 '+(cx-rx)+' '+cy+'Z';}
function RR(x,y,w,h,r){return 'M'+(x+r)+' '+y+'H'+(x+w-r)+'Q'+(x+w)+' '+y+' '+(x+w)+' '+(y+r)+'V'+(y+h-r)+'Q'+(x+w)+' '+(y+h)+' '+(x+w-r)+' '+(y+h)+'H'+(x+r)+'Q'+x+' '+(y+h)+' '+x+' '+(y+h-r)+'V'+(y+r)+'Q'+x+' '+y+' '+(x+r)+' '+y+'Z';}
var _cid=0;
function vol(d,base,shade,dx,dy){var id='cv'+(++_cid);dx=dx==null?-6:dx;dy=dy==null?-6:dy;
  return '<clipPath id="'+id+'"><path d="'+d+'"/></clipPath><g clip-path="url(#'+id+')"><path d="'+d+'" fill="'+shade+'"/><path d="'+d+'" fill="'+base+'" transform="translate('+dx+' '+dy+')"/></g>';}
function clipG(d,inner){var id='cg'+(++_cid);return '<clipPath id="'+id+'"><path d="'+d+'"/></clipPath><g clip-path="url(#'+id+')">'+inner+'</g>';}
function ol(d,w){return '<path d="'+d+'" fill="none" stroke="'+K+'" stroke-width="'+(w||4)+'" stroke-linejoin="round" stroke-linecap="round"/>';}
function hl(cx,cy,rx,ry,r,o){return '<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="#fff" opacity="'+(o==null?.6:o)+'" transform="rotate('+(r==null?-30:r)+' '+cx+' '+cy+')"/>';}
function fp(d,fill,w){return '<path d="'+d+'" fill="'+fill+'" stroke="'+K+'" stroke-width="'+(w==null?4:w)+'" stroke-linejoin="round" stroke-linecap="round"/>';}
function st(d,col,w,o){return '<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="'+w+'" stroke-linecap="round" stroke-linejoin="round"'+(o!=null?' opacity="'+o+'"':'')+'/>';}
function C(cx,cy,r,fill,w){return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"'+(w?' stroke="'+K+'" stroke-width="'+w+'"':'')+'/>';}
function rot(p,a,cx,cy){var t=a*Math.PI/180,dx=p[0]-cx,dy=p[1]-cy;return [Math.round(cx+dx*Math.cos(t)-dy*Math.sin(t)),Math.round(cy+dx*Math.sin(t)+dy*Math.cos(t))];}

var ART={};
/* ---- living room ---- */
ART.mug=(function(){var b='M20 34H82V90Q82 108 64 108H38Q20 108 20 90Z',h='M80 50C100 48 104 64 99 76C94 86 86 88 80 86';
  return st(h,K,21)+st(h,'#EC4434',12)+vol(b,'#EC4434','#B8261E')+C(34,60,5,'#FFF3E0')+C(57,52,4,'#FFF3E0')+C(70,72,5,'#FFF3E0')+C(42,86,4,'#FFF3E0')+C(63,96,3.5,'#FFF3E0')+ol(b)
  +'<ellipse cx="51" cy="34" rx="31" ry="8" fill="#FFF3E0" stroke="'+K+'" stroke-width="4"/><ellipse cx="51" cy="35" rx="24" ry="5" fill="#5A2E1A"/>'+hl(29,56,4,13,0)
  +st('M40 22Q34 15 40 9Q46 3 40 -3','#fff',4,.9)+st('M60 22Q54 15 60 9Q66 3 60 -3','#fff',4,.9);})();
ART.portrait=(function(){var f='M8 10H112V112H8Z',m='M22 24H98V98H22Z';
  return vol(f,'#F2B533','#B9801C')+ol(f)+'<path d="M14 16H106V106H14Z" fill="none" stroke="#FFE08A" stroke-width="3" opacity=".8"/>'+fp(m,'#3E8C78',3.5)
  +clipG(m,'<path d="M24 100C26 78 40 72 60 72C80 72 94 78 96 100Z" fill="#2C2550" stroke="'+K+'" stroke-width="3"/><path d="M52 72L60 86L68 72Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="2.5"/><path d="M57 80L60 92L63 80Z" fill="#EC4434"/>'
  +'<ellipse cx="60" cy="52" rx="19" ry="22" fill="#F4C29C" stroke="'+K+'" stroke-width="3"/><path d="M41 50C38 40 42 36 46 38M79 50C82 40 78 36 74 38" fill="#E8E2D6" stroke="'+K+'" stroke-width="2.5"/>'
  +'<path d="M44 62C50 56 56 58 60 61C64 58 70 56 76 62C80 66 84 62 86 58C84 70 72 70 66 66C63 68 57 68 54 66C48 70 36 70 34 58C36 62 40 66 44 62Z" fill="#E8E2D6" stroke="'+K+'" stroke-width="2.5"/>'
  +'<circle cx="52" cy="50" r="6" fill="none" stroke="'+K+'" stroke-width="2"/><circle cx="68" cy="50" r="6" fill="none" stroke="'+K+'" stroke-width="2"/><path d="M58 50H62" stroke="'+K+'" stroke-width="2"/>')
  +C(14,14,3.5,'#FFE08A')+C(106,14,3.5,'#FFE08A')+C(14,108,3.5,'#FFE08A')+C(106,108,3.5,'#FFE08A');})();
ART.cactus=(function(){var p='M30 78H90L84 112H36Z',b='M47 80V38C47 22 73 22 73 38V80Z',l='M47 64H36C30 64 28 60 28 54V42C28 34 39 34 39 42V52H47Z',r='M73 56H84C90 56 92 52 92 46V34C92 26 81 26 81 34V44H73Z';
  var sp='';[[54,34],[66,40],[58,50],[67,60],[55,68],[34,46],[86,38]].forEach(function(q){sp+=st('M'+q[0]+' '+q[1]+'l-3 -3',K,2.5);});
  return vol(l,'#3BB54A','#25873A')+ol(l)+vol(r,'#3BB54A','#25873A')+ol(r)+vol(b,'#3BB54A','#25873A')+st('M60 32V76','#2A9A40',3,.6)+ol(b)+sp
  +vol(p,'#E46F3C','#AE4A22')+ol(p)+fp('M25 72H95V84H25Z','#F28A55')+hl(53,40,3,9,0,.5)
  +C(60,22,5,'#FF6FB5',3)+C(53,18,4.5,'#FF6FB5',3)+C(67,18,4.5,'#FF6FB5',3)+C(60,15,4.5,'#FF6FB5',3)+C(60,20,3,'#FFD43B');})();
ART.record=(function(){var d=E(60,60,52,52),g='';[46,40,34,28].forEach(function(r){g+='<circle cx="60" cy="60" r="'+r+'" fill="none" stroke="#3E3A5E" stroke-width="1.6"/>';});
  return vol(d,'#26223B','#14111F',-5,-5)+g+'<path d="M60 60L30 16A52 52 0 0 1 52 9Z" fill="#fff" opacity=".18"/><path d="M60 60L92 104A52 52 0 0 1 72 110Z" fill="#fff" opacity=".1"/>'+ol(d)
  +C(60,60,18,'#FFD43B',3.5)+'<path d="M48 54A14 14 0 0 1 72 54" fill="none" stroke="#EC4434" stroke-width="3"/>'+C(60,60,3.5,K);})();
ART.lava=(function(){var g='M48 26H72C84 50 86 66 73 84H47C34 66 36 50 48 26Z',b='M38 112L48 84H72L82 112Z',c='M50 12H70L73 26H47Z';
  return vol(b,'#9AA0C4','#6A7098')+ol(b)+st('M44 100H76','#C8CCE4',3,.8)+vol(g,'#FF9ACB','#D9559A')+clipG(g,'<path d="M50 70C42 60 52 52 58 60C64 68 76 62 74 74C72 84 54 82 50 70Z" fill="#E8338A"/><ellipse cx="62" cy="44" rx="8" ry="10" fill="#E8338A"/><circle cx="52" cy="36" r="4" fill="#E8338A"/>')+ol(g)
  +vol(c,'#9AA0C4','#6A7098')+ol(c)+hl(47,50,3,12,10,.55);})();
ART.book=(function(){var c='M24 12H86Q92 12 92 18V102Q92 108 86 108H24Z',s='M12 18Q12 10 24 12V108Q12 110 12 100Z';
  return vol(c,'#2E5BFF','#1B3BC2')+ol(c)+fp(s,'#1B3BC2')+st('M14 30H22M14 90H22',"#FFD43B",3)+fp('M38 28H78V50H38Z','#FFD43B',3.5)+st('M46 36H70M50 43H66',K,2.5)
  +'<path d="M70 106V120L74 115L78 120V106" fill="#EC4434" stroke="'+K+'" stroke-width="3" stroke-linejoin="round"/>'+hl(84,40,3,14,0,.35);})();
ART.pillow=(function(){var d='M14 22C40 16 80 16 106 22C101 46 101 74 106 98C80 104 40 104 14 98C19 74 19 46 14 22Z';
  return vol(d,'#FF8A2A','#D2611A')+clipG(d,'<path d="M0 54L20 46L40 58L60 46L80 58L100 46L120 54V68L100 60L80 72L60 60L40 72L20 60L0 68Z" fill="#FFC36A"/>')+ol(d)
  +C(14,22,6,'#FFD43B',3)+C(106,22,6,'#FFD43B',3)+C(14,98,6,'#FFD43B',3)+C(106,98,6,'#FFD43B',3)+hl(34,36,5,10,30,.45);})();
ART.remote=(function(){var b=RR(40,6,40,108,12);var inner=vol(b,'#454A6E','#262A45')+ol(b)+C(60,22,7,'#EC4434',3);
  [[50,42],[60,42],[70,42],[50,54],[60,54],[70,54],[50,66],[60,66],[70,66]].forEach(function(q){inner+=C(q[0],q[1],3.6,'#C9CCE8');});
  inner+=C(50,84,4,'#3BB54A',2)+C(60,84,4,'#FFD43B',2)+C(70,84,4,'#2E8BFF',2)+'<rect x="50" y="94" width="20" height="6" rx="3" fill="#C9CCE8"/>';
  return '<g transform="rotate(24 60 60)">'+inner+hl(47,30,2.5,10,0,.45)+'</g>';})();
ART.sock=(function(){var d='M40 18H76V62C76 72 80 76 88 80C104 88 111 99 104 108C98 116 84 114 72 108L52 96C42 90 40 80 40 70Z';
  return vol(d,'#3FE0D0','#1FA89A')+clipG(d,'<rect x="30" y="30" width="60" height="9" fill="#FF4FA0"/><rect x="30" y="48" width="60" height="9" fill="#FF4FA0"/><path d="M84 78C98 84 112 96 104 110C96 120 80 112 72 108L80 96Z" fill="#FFD43B"/>')+ol(d)
  +fp('M38 6H78V20H38Z','#FFF3E0')+st('M46 8V18M54 8V18M62 8V18M70 8V18','#C9BBA8',2);})();
ART.controller=(function(){var d='M30 38H90C106 38 114 58 114 80C114 98 102 104 92 96L82 86H38L28 96C18 104 6 98 6 80C6 58 14 38 30 38Z';
  return vol(d,'#8B5CFF','#5E36CF')+ol(d)+fp('M26 56H36V48H44V56H52V64H44V72H36V64H26Z','#2A2154',3)
  +C(86,54,5,'#FFD43B',3)+C(98,64,5,'#FF4FA0',3)+C(86,74,5,'#B8F23B',3)+C(74,64,5,'#3FE0D0',3)+'<rect x="52" y="48" width="16" height="6" rx="3" fill="#C8B8FF"/>'+hl(26,46,3,8,50,.5);})();

/* ---- kitchen ---- */
ART.banana=(function(){var d='M16 38C22 84 64 106 104 86C109 83 108 76 103 76C72 86 42 72 32 36C30 30 18 30 16 38Z';
  return vol(d,'#FFD43B','#E1A51A',-4,-5)+st('M32 52C44 76 64 86 88 86','#FFF2A8',4,.9)+ol(d)+fp('M16 38L12 26H24L28 36Z','#6B4A1E',3.5)+fp('M103 76L110 78L108 86L103 86Z','#6B4A1E',3);})();
ART.tomato=(function(){var d=E(60,70,47,40);
  return vol(d,'#F23B2E','#B71F1A')+ol(d)+hl(38,56,11,6,-30,.6)+fp('M60 38C54 26 44 26 38 32C48 32 52 36 54 40C46 42 40 48 40 54C48 48 54 46 60 44C66 46 72 48 80 54C80 48 74 42 66 40C68 36 72 32 82 32C76 26 66 26 60 38Z','#3BB54A',3.5)+st('M60 38L63 22',K,9)+st('M60 38L63 22','#3BB54A',4);})();
ART.kettle=(function(){var b='M22 104C14 84 18 56 40 46H80C102 56 106 84 98 104Z',s='M96 66L113 48L118 54L104 82Z';
  return st('M34 48C34 14 86 14 86 48',K,12)+st('M34 48C34 14 86 14 86 48','#3A3561',5)+vol(s,'#FF7A1F','#C9520D')+ol(s)+vol(b,'#FF7A1F','#C9520D')+ol(b)
  +fp('M18 98H102V108H18Z','#2A2838',3.5)+fp('M42 46C44 36 76 36 78 46Z','#FF9A4F',3.5)+C(60,34,6,'#2A2838',3)+hl(34,66,5,13,20,.55);})();
ART.cheese=(function(){var t='M8 68L98 32L114 48L24 86Z',s='M24 86L114 48V70L24 108Z',e='M8 68L24 86V108L8 90Z';
  return fp(t,'#FFE27A')+vol(s,'#FFC62B','#E39A14',-3,-3)+ol(s)+fp(e,'#E39A14')+'<ellipse cx="50" cy="88" rx="7" ry="5" fill="#D98B10"/><ellipse cx="80" cy="72" rx="5" ry="6" fill="#D98B10"/><ellipse cx="98" cy="68" rx="4" ry="3" fill="#D98B10"/><ellipse cx="64" cy="96" rx="3" ry="2.5" fill="#D98B10"/><ellipse cx="60" cy="58" rx="8" ry="3" fill="#E8B43A"/><ellipse cx="86" cy="46" rx="5" ry="2" fill="#E8B43A"/>';})();
ART.donut=(function(){var d=E(60,64,52,44)+E(60,62,15,11),f='M14 58C12 32 38 18 60 18C86 18 108 32 106 56C106 64 99 67 96 62C92 70 86 73 82 68C76 76 68 76 64 72C56 78 46 74 44 70C38 74 30 72 30 66C23 70 15 66 14 58Z'+E(60,60,20,15);
  var sp='';[[36,36,20,'#FFD43B'],[52,28,-30,'#fff'],[76,30,40,'#3FE0D0'],[88,46,-10,'#B8F23B'],[30,52,60,'#fff'],[70,82,0,'#2E8BFF'],[44,82,30,'#FFD43B'],[86,62,70,'#2E8BFF'],[64,40,90,'#B8F23B']].forEach(function(q){sp+='<rect x="'+(q[0]-5)+'" y="'+(q[1]-2)+'" width="10" height="4" rx="2" fill="'+q[3]+'" transform="rotate('+q[2]+' '+q[0]+' '+q[1]+')"/>';});
  return '<path d="'+d+'" fill-rule="evenodd" fill="#DD9A55" stroke="'+K+'" stroke-width="4"/><path d="'+f+'" fill-rule="evenodd" fill="#FF8BC4" stroke="'+K+'" stroke-width="3.5" stroke-linejoin="round"/>'+sp+hl(32,40,4,8,40,.5);})();
ART.whisk=(function(){var w='';['M56 72C26 52 32 8 60 6C88 8 94 52 64 72','M57 72C40 50 44 12 60 8C76 12 80 50 63 72','M59 72C54 50 54 12 60 8C66 12 66 50 61 72'].forEach(function(d){w+=st(d,K,7)+st(d,'#D5DBEE',3.5);});
  var h='M51 70H69V110Q69 118 60 118Q51 118 51 110Z';return w+vol(h,'#3A3561','#24203F')+ol(h)+fp('M50 66H70V74H50Z','#9AA0C4',3)+C(60,108,3,'#9AA0C4');})();
ART.spatula=(function(){var hd=RR(36,8,48,50,9),hn='M52 70H68V112Q68 118 60 118Q52 118 52 112Z';
  var i=vol(hd,'#3BB54A','#25873A')+ol(hd)+'<rect x="44" y="18" width="7" height="30" rx="3.5" fill="'+K+'" opacity=".85"/><rect x="56.5" y="18" width="7" height="30" rx="3.5" fill="'+K+'" opacity=".85"/><rect x="69" y="18" width="7" height="30" rx="3.5" fill="'+K+'" opacity=".85"/>'
  +fp('M54 58H66V72H54Z','#9AA0C4',3.5)+vol(hn,'#C98A4E','#94602F')+ol(hn)+C(60,108,3.5,K);return '<g transform="rotate(-28 60 64)">'+i+'</g>';})();
ART.pan=(function(){var p=E(48,72,42,40),h='M78 44L106 14C110 9 118 15 113 20L86 50Z';
  return vol(h,'#3A3561','#221E3B')+ol(h)+C(110,16,3,'#9AA0C4')+vol(p,'#3A3561','#1C1934',-4,-4)+ol(p)+'<ellipse cx="48" cy="72" rx="32" ry="30" fill="#2A2547"/>'
  +fp('M28 70C24 56 38 50 46 56C54 46 70 52 68 64C76 70 70 86 58 84C50 94 30 90 30 80C22 78 22 72 28 70Z','#FFF8EC',3)+C(50,70,9,'#FFC21F',3)+hl(46,67,2.5,1.5,0,.8);})();
ART.glove=(function(){var d='M34 92C28 72 20 60 17 50C15 43 24 39 28 45L38 62V25C38 16 48 16 48 25V55V17C48 8 58 8 58 17V55V21C58 12 68 12 68 21V57V31C68 22 78 22 78 31V72C78 82 77 88 79 92Z',c='M32 90H82V114H32Z';
  return vol(d,'#FF6FB5','#D94791')+ol(d)+vol(c,'#FF6FB5','#D94791')+ol(c)+st('M40 96V110M48 96V110M56 96V110M64 96V110M72 96V110','#D94791',2.5)+hl(44,30,3,9,0,.55);})();
ART.cereal=(function(){var f='M20 24H84V110H20Z',s='M84 24L100 14V100L84 110Z',t='M20 24L36 14H100L84 24Z';
  return vol(f,'#2E6BFF','#1C47C9',-4,-4)+ol(f)+fp(s,'#1C47C9')+fp(t,'#6E98FF')+fp('M24 32H80V52H24Z','#FFD43B',3)
  +'<text x="52" y="47" text-anchor="middle" font-family="Lilita One,Arial Black,sans-serif" font-size="15" fill="'+K+'">CRUNCH</text>'
  +fp('M30 80H74C74 96 64 104 52 104C40 104 30 96 30 80Z','#FFF3E0',3)+C(40,76,5,'#FFB01F',2.5)+C(52,73,5,'#FFB01F',2.5)+C(64,76,5,'#FFB01F',2.5)+C(46,68,4,'#FFB01F',2.5)+C(58,67,4,'#FFB01F',2.5);})();

/* ---- kids room ---- */
ART.duck=(function(){var d='M18 80C18 62 34 58 50 64C46 52 46 32 66 26C86 20 100 36 96 52C94 60 88 64 84 66C98 66 106 72 104 84C102 102 82 110 60 110C34 110 18 100 18 80Z';
  return vol(d,'#FFD43B','#E1A217')+ol(d)+fp('M92 46C104 44 113 48 111 55C105 60 96 60 90 57Z','#FF7A1F',3.5)+st('M92 52C98 53 104 53 109 52',K,2.5)+fp('M34 82C46 72 64 74 70 86C60 92 46 92 34 82Z','#F2B71F',3)+hl(62,36,4,8,-30,.6);})();
ART.dino=(function(){var d='M6 94C24 90 34 80 40 66C44 50 52 42 62 42L64 28C66 16 78 10 92 12C106 14 113 22 111 32C110 38 104 41 96 41H85C83 47 81 53 79 59C81 71 79 85 73 93L75 110H62L60 98H50L48 110H35L37 93C27 97 17 97 6 94Z';
  return vol(d,'#7ED957','#4FA834')+'<path d="M44 76C50 68 62 66 70 76C66 88 50 90 44 76Z" fill="#C8F09A"/>'+ol(d)+st('M84 56L91 59L89 64',K,4)
  +st('M93 33H109',K,3)+fp('M52 44L56 34L60 43Z','#4FA834',3)+fp('M42 54L44 44L50 51Z','#4FA834',3)+fp('M34 66L34 56L40 62Z','#4FA834',3)+hl(80,18,6,3,-10,.5);})();
ART.robot=(function(){var h=RR(32,16,56,36,8),b=RR(26,56,68,40,8);
  return st('M60 16V6',K,4)+C(60,6,5,'#EC4434',3)+fp('M18 64H26V86H18Z','#9AA0C4',3.5)+fp('M94 64H102V86H94Z','#9AA0C4',3.5)+fp('M36 96H54V112H36Z','#5470D9',3.5)+fp('M66 96H84V112H66Z','#5470D9',3.5)
  +vol(b,'#7F9BFF','#5470D9')+ol(b)+vol(h,'#7F9BFF','#5470D9')+ol(h)+fp(RR(40,24,40,20,6),'#26223B',3)+C(46,76,9,'#FFD43B',3)+st('M46 76L51 71',K,2.5)+C(66,70,4,'#EC4434',2.5)+C(78,70,4,'#3BB54A',2.5)+'<rect x="62" y="80" width="20" height="5" rx="2.5" fill="#26223B"/>'
  +st('M102 75H110',K,4)+fp('M110 66C118 66 118 84 110 84Z','#FFD43B',3)+hl(40,22,6,2.5,0,.6);})();
ART.crown=(function(){var d='M14 96L18 38L42 64L60 22L78 64L102 38L106 96Z';
  return vol(d,'#FFC21F','#D9930E')+ol(d)+fp('M14 82H106V104H14Z','#F2A916')+C(18,38,7,'#FF4FA0',3.5)+C(60,22,7,'#3FE0D0',3.5)+C(102,38,7,'#FF4FA0',3.5)
  +C(38,93,5,'#EC4434',3)+C(60,93,5,'#2E8BFF',3)+C(82,93,5,'#3BB54A',3)+hl(34,72,3,9,-20,.6);})();
ART.teddy=(function(){var bd=E(60,88,30,26),hd=E(60,42,27,25);
  return C(34,22,12,'#B87A4B',4)+C(86,22,12,'#B87A4B',4)+C(34,22,6,'#E8C29A')+C(86,22,6,'#E8C29A')
  +fp(E(30,84,10,15),'#A06A3E')+fp(E(90,84,10,15),'#A06A3E')+vol(bd,'#B87A4B','#8A5530')+'<ellipse cx="60" cy="92" rx="15" ry="14" fill="#E8C29A"/>'+ol(bd)
  +fp(E(42,108,13,9),'#B87A4B')+fp(E(78,108,13,9),'#B87A4B')+'<ellipse cx="42" cy="108" rx="6" ry="4" fill="#E8C29A"/><ellipse cx="78" cy="108" rx="6" ry="4" fill="#E8C29A"/>'
  +vol(hd,'#B87A4B','#8A5530')+ol(hd)+'<ellipse cx="60" cy="52" rx="12" ry="9" fill="#E8C29A" stroke="'+K+'" stroke-width="3"/><path d="M55 48H65L60 54Z" fill="'+K+'"/>'+st('M60 54V57M55 58Q60 61 65 58',K,2.5)
  +fp('M46 68L58 64V72L46 76Z','#EC4434',3)+fp('M74 68L62 64V72L74 76Z','#EC4434',3)+C(60,68,4,'#EC4434',3);})();
ART.rocket=(function(){var b='M60 8C78 22 82 46 80 80H40C38 46 42 22 60 8Z',n='M60 8C70 16 76 26 78 36H42C44 26 50 16 60 8Z';
  return fp('M50 92Q60 122 70 92Z','#FFD43B',3)+'<path d="M55 92Q60 108 65 92Z" fill="#FF7A1F"/>'+fp('M42 62L22 90L25 102L42 88Z','#F23B2E')+fp('M78 62L98 90L95 102L78 88Z','#F23B2E')+fp('M46 80H74L70 92H50Z','#9AA0C4',3.5)
  +vol(b,'#FFF3E0','#D6C8B4')+clipG(b,'<path d="'+n+'" fill="#F23B2E"/><rect x="30" y="70" width="60" height="5" fill="#F23B2E"/>')+ol(b)+C(60,54,11,'#3FB8FF',4)+hl(56,50,3,2,0,.8)+hl(50,30,3,9,-20,.4);})();

/* ---- catalog ---- */
/* traits 0-10: loot (pirate would steal), old (has seen things), tough (wins a fight), isle (desert-island buddy), weird, museum
   col = the object's dominant colour, used by the Pixel Judge. eyes = [x,y] pairs + radius on the 120 box. */
var OBJ=[
 {id:'portrait',nm:'Grandpa portrait',zone:0,x:420,y:282,s:176,col:'#F2B533',t:{loot:6,old:10,tough:2,isle:3,weird:6,museum:10},eyes:[[50,51],[70,51],6],
  names:['Great Uncle Mort','The Colonel','Mustache Max'],brags:['Has watched this family for 40 years. Judging.','Eyes follow you. Respectfully.']},
 {id:'cactus',nm:'Cactus',zone:0,x:182,y:378,s:118,col:'#3BB54A',t:{loot:1,old:5,tough:8,isle:8,weird:4,museum:3},eyes:[[53,52],[67,52],6],
  names:['Pokey','Sir Spikes','Hugh Jabbs'],brags:['Watered once in 2023. Thriving.','Do not hug. Do respect.']},
 {id:'record',nm:'Vinyl record',zone:0,x:600,y:326,s:118,col:'#26223B',t:{loot:6,old:9,tough:2,isle:3,weird:3,museum:8},eyes:[[44,46],[76,46],9],
  names:['DJ Spin','Vinny Vinyl','Groove Holmes'],brags:['Older than everyone in this room. Still spinning.','Has a B-side you are not ready for.']},
 {id:'lava',nm:'Lava lamp',zone:0,x:705,y:532,s:150,col:'#FF8BC4',t:{loot:4,old:7,tough:2,isle:3,weird:9,museum:7},eyes:[[53,50],[67,50],6],
  names:['Groovy Gloria','The Blobfather','Lava Lynn'],brags:['Bubbling since the 70s. Refuses to stop.','Mood: always.']},
 {id:'book',nm:'Giant dictionary',zone:0,x:590,y:754,s:128,col:'#2E5BFF',t:{loot:3,old:8,tough:6,isle:6,weird:2,museum:6},eyes:[[48,74],[68,74],9],
  names:['Professor Pages','Wordsworth','The Big Book'],brags:['Knows every word. Says none.','Heavier than your excuses.']},
 {id:'pillow',nm:'Throw pillow',zone:0,x:140,y:686,s:124,col:'#FF8A2A',t:{loot:1,old:3,tough:1,isle:7,weird:2,museum:1},eyes:[[46,52],[72,52],9],
  names:['Fluffy McPuff','Cushion Cassidy','Pillow Talk'],brags:['Has absorbed 400 naps and counting.','Soft. Dangerous in a pillow fight.']},
 {id:'remote',nm:'TV remote',zone:0,x:338,y:776,s:104,col:'#454A6E',t:{loot:3,old:4,tough:3,isle:1,weird:3,museum:2},eyes:[rot([50,40],24,60,60),rot([70,40],24,60,60),6],
  names:['Remote Ronnie','The Clicker','Channel Chad'],brags:['Went missing for 3 days. Found in the fridge.','Controls everything here except the cat.']},
 {id:'mug',nm:'Coffee mug',zone:0,x:280,y:952,s:108,col:'#EC4434',t:{loot:2,old:5,tough:3,isle:6,weird:2,museum:3},eyes:[[42,68],[62,68],9],
  names:['Mugsy Malone','Sir Sips-a-Lot','Morning Menace'],brags:['Survived 4 dishwashers and one toddler.','Holds coffee. Holds grudges.']},
 {id:'sock',nm:'Lone sock',zone:0,x:470,y:1060,s:112,col:'#3FE0D0',t:{loot:1,old:4,tough:1,isle:2,weird:10,museum:4},eyes:[[52,40],[66,40],7],
  names:['Lonely Larry','Sockrates','Solo Sock'],brags:['Its partner left in 2022. It is thriving.','Smells like victory. Mostly.']},
 {id:'controller',nm:'Game controller',zone:0,x:150,y:1110,s:116,col:'#8B5CFF',t:{loot:5,old:3,tough:3,isle:4,weird:2,museum:4},eyes:[[54,58],[66,58],6],
  names:['Player Two','Button Masher','Joy Stickney'],brags:['Beat every boss except bedtime.','Mashed so hard it has calluses.']},
 {id:'banana',nm:'Banana',zone:1,x:890,y:598,s:116,col:'#FFD43B',t:{loot:1,old:1,tough:1,isle:7,weird:5,museum:1},eyes:[[50,72],[66,79],8],
  names:['Slippy Pete','Bananathan','The Curve'],brags:['Peak potassium. Peak drama.','Ripe for greatness. By Thursday.']},
 {id:'tomato',nm:'Tomato',zone:1,x:1000,y:610,s:92,col:'#F23B2E',t:{loot:1,old:1,tough:1,isle:5,weird:3,museum:1},eyes:[[46,72],[72,72],9],
  names:['Tomato Montana','Lil Saucy','Big Red'],brags:['Technically a fruit. Emotionally a vegetable.','100% splat rate.']},
 {id:'kettle',nm:'Whistling kettle',zone:1,x:1118,y:578,s:138,col:'#FF7A1F',t:{loot:3,old:6,tough:5,isle:6,weird:3,museum:4},eyes:[[48,74],[70,74],8],
  names:['Steamy Steve','Kettle Kate','The Whistler'],brags:['Screams every morning so you do not have to.','Hot-headed, in a fun way.']},
 {id:'cheese',nm:'Swiss cheese',zone:1,x:1246,y:606,s:104,col:'#FFC62B',t:{loot:4,old:6,tough:1,isle:6,weird:4,museum:2},eyes:[[56,84],[76,76],7],
  names:['Holey Moley','The Big Cheese','Cheddar Wedder'],brags:['Full of holes. Not one in its story.','Aged 6 months. Still not tired.']},
 {id:'donut',nm:'Frosted donut',zone:1,x:1352,y:612,s:100,col:'#FF8BC4',t:{loot:3,old:1,tough:1,isle:4,weird:3,museum:2},eyes:[[44,38],[76,38],8],
  names:['Sprinkles McGee','Donut Disturb','Sir Glazealot'],brags:['Sweet outside. Sweet inside. No middle.','The hole is a feature.']},
 {id:'whisk',nm:'Whisk',zone:1,x:900,y:470,s:110,col:'#D5DBEE',t:{loot:2,old:3,tough:2,isle:3,weird:6,museum:2},eyes:[[52,38],[68,38],7],
  names:['Sir Whiskers','Twirly Shirley','The Tornado'],brags:['Whipped more cream than you have had birthdays.','Spins faster than gossip.']},
 {id:'spatula',nm:'Spatula',zone:1,x:1032,y:478,s:118,col:'#3BB54A',t:{loot:1,old:3,tough:6,isle:5,weird:3,museum:2},eyes:[rot([50,30],-28,60,64),rot([70,30],-28,60,64),7],
  names:['Flip Johnson','Spatricia','The Flipper'],brags:['Flipped 1,000 pancakes. Zero regrets.','Gets you out of sticky situations.']},
 {id:'pan',nm:'Frying pan',zone:1,x:1186,y:470,s:132,col:'#3A3561',t:{loot:3,old:6,tough:10,isle:8,weird:2,museum:3},eyes:[[38,70],[58,62],7],
  names:['Pan Solo','Sir Sizzle','Frying Ryan'],brags:['Cast iron. Iron will.','Has been in more cartoon fights than anyone.']},
 {id:'glove',nm:'Rubber glove',zone:1,x:1004,y:776,s:104,col:'#FF6FB5',t:{loot:1,old:2,tough:3,isle:4,weird:7,museum:2},eyes:[[50,72],[64,72],7],
  names:['Glove Actually','Pinky','High Five Hal'],brags:['Has touched things you do not want to know about.','Always ready for a high five.']},
 {id:'cereal',nm:'Cereal box',zone:1,x:1498,y:96,s:124,col:'#2E6BFF',t:{loot:2,old:2,tough:2,isle:6,weird:3,museum:2},eyes:[[42,64],[62,64],8],
  names:['Sergeant Crunch','Breakfast Barry','The Box Office'],brags:['Part of a complete breakfast. The fun part.','Prize inside. Allegedly.']},
 {id:'rocket',nm:'Toy rocket',zone:2,x:1758,y:330,s:140,col:'#F23B2E',t:{loot:5,old:4,tough:4,isle:3,weird:4,museum:7},eyes:[[52,64],[68,64],7],
  names:['Captain Liftoff','Rocket Hank','Commander Whoosh'],brags:['Been to space twice. Both times under the bed.','Fastest thing here after the cat.']},
 {id:'robot',nm:'Wind-up robot',zone:2,x:1700,y:502,s:112,col:'#7F9BFF',t:{loot:4,old:6,tough:6,isle:5,weird:6,museum:6},eyes:[[50,34],[70,34],8],
  names:['Bolt Robbins','Clank Hanks','Unit 7'],brags:['Walks into walls with total confidence.','Will not take over the world. Probably.']},
 {id:'dino',nm:'Toy dinosaur',zone:2,x:1806,y:668,s:122,col:'#7ED957',t:{loot:3,old:9,tough:8,isle:4,weird:6,museum:6},eyes:[[86,24],[98,24],6],
  names:['Rex Mundy','Chompers','Tiny Arms Tony'],brags:['Survived an asteroid and a toy box.','Tiny arms. Huge ambitions.']},
 {id:'teddy',nm:'Teddy bear',zone:2,x:2052,y:612,s:142,col:'#B87A4B',t:{loot:3,old:8,tough:3,isle:9,weird:2,museum:5},eyes:[[50,38],[70,38],7],
  names:['Mr. Snuggles','Sir Hugsby','Bearnard'],brags:['Has heard every secret in this house.','Missing one button. Fears nothing.']},
 {id:'crown',nm:'Party crown',zone:2,x:2260,y:700,s:104,col:'#FFC21F',t:{loot:10,old:3,tough:1,isle:2,weird:5,museum:8},eyes:[[46,74],[74,74],8],
  names:['Queen Pointy','Her Royal Shininess','King Party'],brags:['Rules the house. Literally a crown.','Came from a cracker. Acts like a castle.']},
 {id:'duck',nm:'Rubber duck',zone:2,x:2160,y:1012,s:104,col:'#FFD43B',t:{loot:2,old:4,tough:2,isle:8,weird:7,museum:4},eyes:[[70,40],[84,42],7],
  names:['Quackson Pollock','Admiral Squeak','Sir Floatsalot'],brags:['Undefeated in every bath since 2019.','Squeaks once. Room goes silent.']}
];
var OBJI={};OBJ.forEach(function(o){OBJI[o.id]=o;});

/* ---- the house: 2400 x 1200 panorama. Furniture is muted with thin lines so the objects pop ---- */
var HW=2400,HH=1200;
function houseBack(){ /* wall decor: parallax layer */
  var s='';
  s+='<rect x="0" y="0" width="800" height="900" fill="#E2A08A"/><rect x="800" y="0" width="800" height="900" fill="#EBDDA6"/><rect x="1600" y="0" width="800" height="900" fill="#B9A8E2"/>';
  for(var i=0;i<8;i++) s+='<path d="M'+(i*100+50)+' 0V900" stroke="#D6907A" stroke-width="22" opacity=".45"/>';
  for(var y=60;y<900;y+=120) for(var x=1640;x<2400;x+=120) s+='<path d="M'+x+' '+y+'l6 14 15 2 -11 10 3 15 -13 -7 -13 7 3 -15 -11 -10 15 -2z" fill="#CBBDF0"/>';
  s+='<path d="M70 120H300V430H70Z" fill="#2B2F7A" stroke="'+K+'" stroke-width="5"/><circle cx="240" cy="190" r="34" fill="#FFF0B8"/><circle cx="254" cy="180" r="30" fill="#2B2F7A"/>';
  [[110,170],[150,260],[200,330],[270,300],[120,370],[180,210]].forEach(function(q){s+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="3.5" fill="#FFF0B8"/>';});
  s+='<path d="M70 275H300M185 120V430" stroke="#F4E6D2" stroke-width="10"/><path d="M70 120H300V430H70Z" fill="none" stroke="#F4E6D2" stroke-width="14"/><path d="M58 430H312V448H58Z" fill="#F4E6D2" stroke="'+K+'" stroke-width="4"/>';
  s+='<path d="M60 112C90 180 70 300 52 420" fill="none" stroke="#C7563F" stroke-width="26" stroke-linecap="round"/><path d="M310 112C280 180 300 300 318 420" fill="none" stroke="#C7563F" stroke-width="26" stroke-linecap="round"/>';
  s+='<path d="M1880 120H2240V330H1880Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="5" transform="rotate(-3 2060 225)"/><text x="2060" y="246" text-anchor="middle" font-family="Lilita One,Arial Black,sans-serif" font-size="58" fill="#7A5CE0" transform="rotate(-3 2060 225)">GO TEAM!</text>';
  s+='<path d="M1950 400L2250 380" stroke="#6B55B8" stroke-width="3"/>';
  ['#FF4FA0','#FFD43B','#3FE0D0','#B8F23B','#FF7A1F'].forEach(function(c,i){var x=1965+i*58,y=399-i*4;s+='<path d="M'+x+' '+y+'l40 -3 -18 46z" fill="'+c+'" stroke="'+K+'" stroke-width="3" stroke-linejoin="round"/>';});
  s+='<path d="M860 200H1060V400H860ZM1180 200H1380V400H1180Z" fill="#F4E6D2" stroke="'+K+'" stroke-width="4"/><path d="M960 200V400M1280 200V400" stroke="'+K+'" stroke-width="3"/><circle cx="948" cy="300" r="5" fill="'+K+'"/><circle cx="972" cy="300" r="5" fill="'+K+'"/><circle cx="1268" cy="300" r="5" fill="'+K+'"/><circle cx="1292" cy="300" r="5" fill="'+K+'"/>';
  s+='<path d="M1070 230H1170V370H1070Z" fill="#9AD4F5" stroke="'+K+'" stroke-width="4"/><path d="M1120 230V370M1070 300H1170" stroke="#F4E6D2" stroke-width="6"/>';
  s+='<path d="M840 410H1400V640H840Z" fill="#F6EFDF"/>';
  for(var ty=410;ty<640;ty+=46) s+='<path d="M840 '+ty+'H1400" stroke="#D9CDB4" stroke-width="2"/>';
  for(var tx=840;tx<1400;tx+=46) s+='<path d="M'+tx+' 410V640" stroke="#D9CDB4" stroke-width="2"/>';
  s+='<path d="M850 420H1390" stroke="#8A7F6A" stroke-width="6" stroke-linecap="round"/>';
  [[900,420],[1032,420],[1186,420]].forEach(function(q){s+='<path d="M'+q[0]+' '+q[1]+'v12" stroke="#8A7F6A" stroke-width="4"/>';});
  return s;
}
function houseFront(){ /* floor + furniture: moves 1:1 with the objects */
  var s='';
  s+='<rect x="0" y="880" width="2400" height="320" fill="#C48B57"/>';
  for(var y=910;y<1200;y+=46) s+='<path d="M0 '+y+'H2400" stroke="#A9733F" stroke-width="3"/>';
  for(var x=0;x<2400;x+=160) for(var yy=0;yy<7;yy++) s+='<path d="M'+(x+(yy%2)*80)+' '+(880+yy*46)+'v46" stroke="#A9733F" stroke-width="3"/>';
  s+='<path d="M0 870H2400V892H0Z" fill="#F4E6D2" stroke="'+K+'" stroke-width="4"/>';
  s+='<path d="M795 0V892" stroke="'+K+'" stroke-width="5"/><path d="M1605 0V892" stroke="'+K+'" stroke-width="5"/><path d="M786 0H804V892H786ZM1596 0H1614V892H1596Z" fill="#F4E6D2" stroke="'+K+'" stroke-width="4"/>';
  /* living: couch, shelf, lamp, rug, table */
  s+='<ellipse cx="300" cy="1080" rx="290" ry="80" fill="#5B8FD6" stroke="'+K+'" stroke-width="4"/><ellipse cx="300" cy="1080" rx="230" ry="56" fill="none" stroke="#B6CFF2" stroke-width="10"/>';
  s+='<path d="M30 600Q30 580 60 580H440Q470 580 470 600V860H30Z" fill="#3E8C8A" stroke="'+K+'" stroke-width="5"/><path d="M14 700Q14 680 40 680H70V880H14Z" fill="#357A78" stroke="'+K+'" stroke-width="5"/><path d="M430 680H460Q486 680 486 700V880H430Z" fill="#357A78" stroke="'+K+'" stroke-width="5"/>';
  s+='<path d="M70 760H430V840H70Z" fill="#4AA19E" stroke="'+K+'" stroke-width="5"/><path d="M250 760V840" stroke="'+K+'" stroke-width="3"/><path d="M40 880V900M460 880V900" stroke="'+K+'" stroke-width="10"/>';
  s+='<path d="M140 970H420L440 1000H120Z" fill="#A86B3C" stroke="'+K+'" stroke-width="4"/><path d="M120 1000H440V1016H120Z" fill="#8A5530" stroke="'+K+'" stroke-width="4"/><path d="M140 1016V1090M420 1016V1090" stroke="'+K+'" stroke-width="10"/>';
  s+='<path d="M520 220H770V880H520Z" fill="#A86B3C" stroke="'+K+'" stroke-width="5"/><path d="M536 236H754V864H536Z" fill="#7A4A26"/>';
  [380,600,820].forEach(function(y){s+='<path d="M530 '+y+'H760V'+(y+16)+'H530Z" fill="#C98A4E" stroke="'+K+'" stroke-width="4"/>';});
  s+='<path d="M546 380V300H562V380ZM566 380V290H582V380Z" fill="#E46F3C" stroke="'+K+'" stroke-width="3"/><path d="M690 380V306H704V380ZM708 380V296H722V380ZM726 380V310H740V380Z" fill="#3E8C8A" stroke="'+K+'" stroke-width="3"/>';
  s+='<path d="M546 600V530H562V600ZM566 600V520H584V600ZM588 600V540H602V600Z" fill="#7A5CE0" stroke="'+K+'" stroke-width="3"/>';
  s+='<path d="M660 820V760H678V820ZM682 820V750H700V820ZM704 820V766H718V820Z" fill="#F2B533" stroke="'+K+'" stroke-width="3"/>';
  s+='<path d="M486 580V880" stroke="'+K+'" stroke-width="6"/><path d="M466 880H506" stroke="'+K+'" stroke-width="8" stroke-linecap="round"/><path d="M458 520H514L500 580H472Z" fill="#FFD9A0" stroke="'+K+'" stroke-width="4"/>';
  /* kitchen: counter + cabinets + fridge + stool */
  s+='<path d="M830 640H1410V670H830Z" fill="#E9E1CF" stroke="'+K+'" stroke-width="5"/><path d="M840 670H1400V880H840Z" fill="#7FB5A6" stroke="'+K+'" stroke-width="5"/>';
  [840,980,1120,1260].forEach(function(x){s+='<path d="M'+(x+10)+' 684H'+(x+130)+'V866H'+(x+10)+'Z" fill="#8DC2B3" stroke="'+K+'" stroke-width="3"/><path d="M'+(x+50)+' 700H'+(x+90)+'" stroke="'+K+'" stroke-width="6" stroke-linecap="round"/>';});
  s+='<path d="M1076 632H1162" stroke="'+K+'" stroke-width="8" stroke-linecap="round"/>';
  s+='<path d="M1420 160Q1420 150 1430 150H1580Q1590 150 1590 160V880H1420Z" fill="#CFDDEE" stroke="'+K+'" stroke-width="5"/><path d="M1420 420H1590" stroke="'+K+'" stroke-width="4"/><path d="M1440 200V300M1440 450V560" stroke="'+K+'" stroke-width="8" stroke-linecap="round"/>';
  s+='<circle cx="1530" cy="250" r="12" fill="#FF4FA0" stroke="'+K+'" stroke-width="3"/><path d="M1500 480H1560V560H1500Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="3" transform="rotate(4 1530 520)"/><path d="M1510 500H1550M1510 515H1544M1510 530H1550" stroke="#7A5CE0" stroke-width="3" transform="rotate(4 1530 520)"/><circle cx="1530" cy="480" r="7" fill="#B8F23B" stroke="'+K+'" stroke-width="3"/>';
  s+='<ellipse cx="1240" cy="1040" rx="80" ry="22" fill="#A86B3C" stroke="'+K+'" stroke-width="4"/><path d="M1180 1050L1170 1180M1300 1050L1310 1180M1240 1060V1180" stroke="'+K+'" stroke-width="9"/>';
  /* kids room: toy shelf, bed, rug */
  s+='<ellipse cx="2150" cy="1060" rx="210" ry="70" fill="#FFB8D9" stroke="'+K+'" stroke-width="4"/><ellipse cx="2150" cy="1060" rx="150" ry="46" fill="none" stroke="#FFF3E0" stroke-width="10" stroke-dasharray="20 14"/>';
  s+='<path d="M1640 400H1880V880H1640Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="5"/><path d="M1650 410H1870V870H1650Z" fill="#E9DCFA"/>';
  [560,730].forEach(function(y){s+='<path d="M1646 '+y+'H1874V'+(y+14)+'H1646Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="4"/>';});
  s+='<path d="M1760 410V880" stroke="'+K+'" stroke-width="4" opacity=".4"/><path d="M1780 870V800H1840V870Z" fill="#3FE0D0" stroke="'+K+'" stroke-width="3"/><path d="M1790 800V780H1830V800Z" fill="#FF4FA0" stroke="'+K+'" stroke-width="3"/><path d="M1670 870V820H1720V870Z" fill="#FFD43B" stroke="'+K+'" stroke-width="3"/>';
  s+='<path d="M1950 520Q1950 480 1990 480H2010Q2040 480 2040 520V880H1950Z" fill="#7A5CE0" stroke="'+K+'" stroke-width="5"/>';
  s+='<path d="M1990 660H2390V820H1990Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="5"/><path d="M2080 640Q2240 600 2390 640V840H2080Z" fill="#FF7FB8" stroke="'+K+'" stroke-width="5"/><path d="M2080 700Q2240 664 2390 700M2080 760Q2240 724 2390 760" stroke="#FFD43B" stroke-width="10" fill="none"/>';
  s+='<path d="M1996 820H2390V880H1996Z" fill="#6648C4" stroke="'+K+'" stroke-width="5"/><path d="M2010 880V900M2370 880V900" stroke="'+K+'" stroke-width="10"/><path d="M1998 620Q2000 600 2030 602H2080Q2096 604 2094 626Q2092 660 2060 660H2018Q1996 656 1998 620Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="4"/>';
  return s;
}

/* ---- Sir Socksworth: host puppet. viewBox 0 0 200 240. Mouth line at y=128. ---- */
var SOX={
 upper:'<path d="M40 130C34 70 58 28 104 26C150 24 170 66 164 130Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="5" stroke-linejoin="round"/>'
   +'<path d="M150 50C160 70 164 100 162 128" fill="none" stroke="#E6D3B4" stroke-width="12" stroke-linecap="round" opacity=".9"/>'
   +'<g transform="rotate(-14 110 26)"><path d="M84 30L82 -4H130L128 30Z" fill="#1C1840" stroke="'+K+'" stroke-width="5" stroke-linejoin="round"/><path d="M83 16H129V24H83Z" fill="#FF4FA0"/><ellipse cx="106" cy="31" rx="38" ry="8" fill="#1C1840" stroke="'+K+'" stroke-width="5"/></g>',
 brows:'<path id="sx-bl" d="M58 52Q72 44 88 50" fill="none" stroke="'+K+'" stroke-width="6" stroke-linecap="round"/><path id="sx-br" d="M112 46Q128 38 146 46" fill="none" stroke="'+K+'" stroke-width="6" stroke-linecap="round"/>',
 monocle:'<circle cx="128" cy="78" r="25" fill="none" stroke="#FFC21F" stroke-width="5"/><circle cx="128" cy="78" r="25" fill="none" stroke="'+K+'" stroke-width="1.5"/><path d="M150 92Q170 140 152 172" fill="none" stroke="#FFC21F" stroke-width="3" stroke-dasharray="4 3"/>',
 lower:'<path d="M42 128C76 146 128 146 162 128C160 160 156 190 154 244H50C48 190 44 160 42 128Z" fill="#FFF3E0" stroke="'+K+'" stroke-width="5" stroke-linejoin="round"/>'
   +'<clipPath id="sx-lc"><path d="M42 128C76 146 128 146 162 128C160 160 156 190 154 244H50C48 190 44 160 42 128Z"/></clipPath><g clip-path="url(#sx-lc)"><rect x="30" y="196" width="150" height="14" fill="#FF4FA0"/><rect x="30" y="218" width="150" height="14" fill="#2B3BFF"/><path d="M150 140C158 170 156 210 154 244" stroke="#E6D3B4" stroke-width="12" fill="none"/></g>'
   +'<path d="M78 166L100 176L78 186Z" fill="#FFC21F" stroke="'+K+'" stroke-width="4" stroke-linejoin="round"/><path d="M126 166L104 176L126 186Z" fill="#FFC21F" stroke="'+K+'" stroke-width="4" stroke-linejoin="round"/><circle cx="102" cy="176" r="7" fill="#FF4FA0" stroke="'+K+'" stroke-width="4"/>'
};
