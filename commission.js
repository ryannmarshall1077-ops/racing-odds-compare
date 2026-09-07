// Betfair Market Base Rate lookup — used to compute a commission-adjusted
// edge that matches HorsePower's QL% math, instead of the raw
// (bookmaker - betfair) / betfair ratio.
//
// Rates from Betfair's published Market Base Rate table.
const BETFAIR_COMMISSION = {
  horse: {
    ACT: 0.10, NSW: 0.10, NT: 0.08, NZ: 0.06,
    QLD: 0.08, SA: 0.08, TAS: 0.08, VIC: 0.08, WA: 0.08, INT: 0.06,
  },
};
const FALLBACK_COMMISSION = 0.08; // most common rate, used if track is unrecognized

// Track name -> state. Add more here as needed.
const TRACK_STATE_MAP = {
  // NSW
  randwick: "NSW", rosehill: "NSW", "warwick farm": "NSW", canterbury: "NSW",
  "kembla grange": "NSW", newcastle: "NSW", gosford: "NSW", wyong: "NSW",
  hawkesbury: "NSW", wagga: "NSW", albury: "NSW", dubbo: "NSW", tamworth: "NSW",
  armidale: "NSW", grafton: "NSW", "coffs harbour": "NSW", "port macquarie": "NSW",
  taree: "NSW", scone: "NSW", muswellbrook: "NSW", quirindi: "NSW", goulburn: "NSW",
  queanbeyan: "NSW", bathurst: "NSW", orange: "NSW", mudgee: "NSW", parkes: "NSW",
  forbes: "NSW", cowra: "NSW", young: "NSW", griffith: "NSW", leeton: "NSW",
  narrandera: "NSW", deniliquin: "NSW", moree: "NSW", inverell: "NSW", ballina: "NSW",
  lismore: "NSW", "broken hill": "NSW", hay: "NSW", cootamundra: "NSW", gundagai: "NSW",
  tumut: "NSW", wellington: "NSW", nyngan: "NSW", coonamble: "NSW", gunnedah: "NSW",
  goondiwindi: "NSW", casino: "NSW", kempsey: "NSW",

  // ACT
  canberra: "ACT",

  // VIC
  flemington: "VIC", caulfield: "VIC", "moonee valley": "VIC", sandown: "VIC",
  cranbourne: "VIC", pakenham: "VIC", geelong: "VIC", ballarat: "VIC", bendigo: "VIC",
  warrnambool: "VIC", sale: "VIC", wangaratta: "VIC", wodonga: "VIC", mildura: "VIC",
  "swan hill": "VIC", echuca: "VIC", kilmore: "VIC", seymour: "VIC", werribee: "VIC",
  bairnsdale: "VIC", traralgon: "VIC", moe: "VIC", hamilton: "VIC", colac: "VIC",
  terang: "VIC", camperdown: "VIC", casterton: "VIC", horsham: "VIC", stawell: "VIC",
  ararat: "VIC", donald: "VIC", kerang: "VIC", cobram: "VIC", shepparton: "VIC",
  tatura: "VIC", yarrawonga: "VIC", benalla: "VIC", avoca: "VIC",

  // QLD
  "eagle farm": "QLD", doomben: "QLD", "gold coast": "QLD", "sunshine coast": "QLD",
  toowoomba: "QLD", ipswich: "QLD", rockhampton: "QLD", mackay: "QLD",
  townsville: "QLD", cairns: "QLD", bundaberg: "QLD", gympie: "QLD", warwick: "QLD",
  roma: "QLD", dalby: "QLD", clifton: "QLD", kilcoy: "QLD", beaudesert: "QLD",
  gatton: "QLD", longreach: "QLD", charleville: "QLD", emerald: "QLD", gladstone: "QLD",
  ayr: "QLD", innisfail: "QLD", mareeba: "QLD", atherton: "QLD",

  // SA
  morphettville: "SA", "murray bridge": "SA", gawler: "SA", balaklava: "SA",
  strathalbyn: "SA", oakbank: "SA", "port lincoln": "SA", "mount gambier": "SA",
  naracoorte: "SA", bordertown: "SA", penola: "SA", clare: "SA",
  "port augusta": "SA", "port pirie": "SA", kapunda: "SA", "victor harbor": "SA",

  // WA
  ascot: "WA", belmont: "WA", pinjarra: "WA", bunbury: "WA", northam: "WA",
  york: "WA", narrogin: "WA", kalgoorlie: "WA", geraldton: "WA", albany: "WA",
  esperance: "WA", broome: "WA", carnarvon: "WA", "mount barker": "WA",

  // TAS
  elwick: "TAS", hobart: "TAS", mowbray: "TAS", launceston: "TAS",
  devonport: "TAS", spreyton: "TAS", longford: "TAS", carrick: "TAS",
  scottsdale: "TAS", burnie: "TAS",

  // NT
  "fannie bay": "NT", darwin: "NT", "alice springs": "NT", katherine: "NT",
  "tennant creek": "NT",

  // NZ
  ellerslie: "NZ", trentham: "NZ", riccarton: "NZ", awapuni: "NZ", otaki: "NZ",
  hastings: "NZ", "te rapa": "NZ", ruakaka: "NZ", matamata: "NZ", cambridge: "NZ",
  ashburton: "NZ", riverton: "NZ", wingatui: "NZ", gore: "NZ", timaru: "NZ",
  waverley: "NZ", wanganui: "NZ", whanganui: "NZ", "new plymouth": "NZ",
  rotorua: "NZ", tauranga: "NZ", taupo: "NZ", woodville: "NZ", hawera: "NZ",
};

function commissionForTrack(trackName) {
  const normalized = (trackName || "").toLowerCase().trim();
  const state = TRACK_STATE_MAP[normalized];
  if (!state) {
    console.warn(
      `[commission] Unrecognized track "${trackName}" — using fallback ${FALLBACK_COMMISSION * 100}% commission. Add it to TRACK_STATE_MAP in commission.js.`
    );
    return FALLBACK_COMMISSION;
  }
  return BETFAIR_COMMISSION.horse[state] ?? FALLBACK_COMMISSION;
}
