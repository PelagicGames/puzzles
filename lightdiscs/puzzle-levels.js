// Copyright (C) 2026 Pelagic Games

(() => {
  window.LightDiscLevels = [
    {
      title: "Puzzle 1",
      difficulty: "very-easy",
      code: "R: nr nr nr G: ng ng ng B: nb nb nb T: nr ng nb"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-easy",
      code: "R: twr t'rw twr G: twg t'gw tkg B: twb t'bw xkb T: twr t'wk xkb"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-easy",
      code: "R: lkg sbk lbg G: drg swg vbc B: sbc ary ny T: lkg vbc lkg"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-easy",
      code: "R: s''mw dmc xbw G: t'rg s''cy vky B: s'kb tgm s''yc T: s''yc s''mw s''cy"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-easy",
      code: "R: s'by vmg s''cb G: xcm vmc s''mg B: t'yw s'ck s'rc T: s'rc s'by vmc"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-easy",
      code: "R: xbm vmb vcm G: vbg t'cy tgb B: vry arc drm T: drm xbm t'cy"
    },
    {
      title: "Puzzle 1",
      difficulty: "easy",
      code: "R: nm nc nm G: ny ny nm B: nc nc ny T: nr nb ng"
    },
    {
      title: "Puzzle 2",
      difficulty: "easy",
      code: "R: nc nm nw G: ny ny nm B: nc nc ny T: nr nb ng"
    },
    {
      title: "Puzzle 3",
      difficulty: "easy",
      code: "R: dbk nc aym G: drk sbg lbm B: vbk lyr vgk T: lkr nk vbk"
    },
    {
      title: "Puzzle 4",
      difficulty: "easy",
      code: "R: nr ny tgk G: akg lmw dmw B: dbm xmk dcb T: akg nk xrk"
    },
    {
      title: "Puzzle 5",
      difficulty: "easy",
      code: "R: tcy dwy dcr G: vmy ayw trg B: acm nc lwg T: vbg ayw trg"
    },
    {
      title: "Puzzle 6",
      difficulty: "easy",
      code: "R: sym dbk dbm G: tmk lyw dmr B: dby lbr dgr T: lkr t'bk dmr"
    },
    {
      title: "Puzzle 1",
      difficulty: "medium",
      code: "R: lky dcy lry G: abr srb xwr B: s'bg sgb xrw T: xrw lbk s'gb"
    },
    {
      title: "Puzzle 2",
      difficulty: "medium",
      code: "R: tcb t'yc t'rc G: s'bk s'by tgr B: lbg s'wy s'cg T: t'rc tcb s''kg"
    },
    {
      title: "Puzzle 3",
      difficulty: "medium",
      code: "R: amk tkm vmy G: s'br acr xkr B: twb sgm vgb T: dkb vgb twb"
    },
    {
      title: "Puzzle 4",
      difficulty: "medium",
      code: "R: s''bm vwr lrc G: vyw s''ky xky B: s'rb lgc xkc T: s'kg xky vyr"
    },
    {
      title: "Puzzle 5",
      difficulty: "medium",
      code: "R: xgk vwg acy G: vkc xym sbg B: t'wg vmb lmr T: vkc akr sbg"
    },
    {
      title: "Puzzle 6",
      difficulty: "medium",
      code: "R: sgy xry tky G: s''wy dmy xwm B: s'wm twr tgw T: twr tgw s''kr"
    },
    {
      title: "Puzzle 1",
      difficulty: "hard",
      code: "R: dkc s'rc lwy G: dgy vbr s'gm B: drc swy nm T: dkg vbr drc"
    },
    {
      title: "Puzzle 2",
      difficulty: "hard",
      code: "R: drw t'gm s''cg G: xkg xgc ny B: s''bm vrm vmb T: drm t'kb nk"
    },
    {
      title: "Puzzle 3",
      difficulty: "hard",
      code: "R: agy tbc sbm G: vbk abm dck B: vry acw vkb T: nk s''kr akr"
    },
    {
      title: "Puzzle 4",
      difficulty: "hard",
      code: "R: xgc dcr t'bc G: s''rw t'ky vrg B: lkb s'ry s''rg T: s'kb skg tkg"
    },
    {
      title: "Puzzle 5",
      difficulty: "hard",
      code: "R: dkb sbw trg G: t'mg nm aky B: acw s''km s'cy T: t'mg trk aky"
    },
    {
      title: "Puzzle 6",
      difficulty: "hard",
      code: "R: lgr sbm lwm G: s''gw t'gy xry B: smc nb xcb T: s'kb nk xgk"
    },
    {
      title: "Puzzle 1",
      difficulty: "very-hard",
      code: "R: amw t'wy vgk G: vgm s'mg t'cy B: xrb s'wy s''bc T: swy nk nk"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-hard",
      code: "R: tgr s'ky lwk G: nc ayk lyb B: tyk nr t'wb T: dkr lck twb"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-hard",
      code: "R: vgk twc vmk G: t'gy lcw tgb B: dyb t'kr dmw T: t'kr tkb dgk"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-hard",
      code: "R: lgc vgr s'wr G: swm tgb lmc B: lcr vwc amr T: lgk lkc vkr"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-hard",
      code: "R: s'gb vbk nb G: xyb s'cg vck B: s'km t'wb s'my T: nk nk s'cg"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-hard",
      code: "R: syc t'mk smc G: t'cw lcb dry B: t'gk nm t'gk T: lcb nk s'rk"
    }
  ];
  window.LightDiscLevels.forEach((level) => {
    level.combination = "standard";
  });
})();
