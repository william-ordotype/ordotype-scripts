/**
 * Ordotype Pathology - Omnidoc links
 * Turns specialist-opinion mentions of the clinical summary ("avis spécialisé",
 * "avis pneumologique"...) into links to /avis-specialise.
 * Vanilla DOM — must not depend on jQuery.
 */
(function() {
  'use strict';

  var ENABLED = false;
  var PREVIEW_KEY = 'ordo_omnidoc_preview';
  var TARGET = '/avis-specialise';
  var LINK_CLASS = 'ordo-omnidoc-link';

  var FICHES = {"abces-dentaire":["mal_inf_trop","chir_maxilo_stoma"],"abces-superficiel":["mal_inf_trop","derm_venero"],"accidents-dexposition-sexuelle-et-au-sang":["mal_inf_trop"],"acne":["derm_venero"],"acouphenes":["orl_chir_cerv"],"adenopathie":["med_intern","hemato"],"alcool":["psy","addicto"],"algie-vasculaire-de-la-face":["neuro"],"algodystrophie":["rhumato"],"alimentation-de-lenfant-hors-situations-particulieres":["pedia"],"allaitement-maternel":["gyneco_med_obst","pedia"],"allergie-aux-proteines-de-lait-de-vache":["pedia","gastro_hépato","allergo"],"alopecie":["derm_venero"],"amaigrissement":["endo_diab_nutr","med_intern"],"amenorrhee":["gyneco_med_obst"],"anemie":["med_intern","hemato"],"angine-2":["mal_inf_trop","pedia","orl_chir_cerv"],"anomalie-du-bilan-hepatique":["gastro_hépato","med_intern","bio_med"],"anomalie-du-gout":["orl_chir_cerv"],"anomalies-du-bilan-hepatique-au-cours-de-la-grossesse":["gyneco_med_obst","gastro_hépato","bio_med"],"anorexie-mentale":["endo_diab_nutr","psy"],"aomi":["card_mal_vasc","med_vasc"],"aphtose":["chir_maxilo_stoma"],"apnee-du-sommeil":["orl_chir_cerv","pneumo","card_mal_vasc"],"aponevrosite-plantaire-epine-calcaneenne-rhumatologie":["rhumato"],"arthrite-aigue":["rhumato"],"arthrite-aigue-rhumatologie":["rhumato"],"arthrose-de-lepaule-omarthrose":["rhumato","chir_ortho_trauma"],"arthrose-digitale":["rhumato","chir_ortho_trauma"],"arthrose-digitale-rhumatologie":["rhumato"],"arthrose-du-genou":["rhumato"],"arthrose-du-genou-rhumatologie":["rhumato"],"arthrose-genou-orientation":["rhumato"],"arthrose-hanche-coxarthrose-rhumatologie":["rhumato"],"asthenie":["med_intern"],"asthme":["pneumo","allergo"],"asthme-deffort":["pneumo","med_sport","allergo"],"asthme-exacerbation":["pneumo"],"bacteriurie-asymptomatique":["urolo"],"baisse-rapide-de-lacuite-visuelle":["ophtalmo"],"balano-posthite":["mal_inf_trop","derm_venero","urolo"],"bandelette-urinaire":["urolo","bio_med","nephro"],"bartholinite":["mal_inf_trop","gyneco_med_obst"],"bilan-migrant":["mal_inf_trop"],"boiterie-de-lenfant":["pedia","chir_ortho_trauma"],"bouchon-de-cerumen":["orl_chir_cerv"],"boulimie":["endo_diab_nutr","psy"],"bpco":["pneumo"],"bpco-exacerbation":["pneumo"],"bronchiolite":["mal_inf_trop","pedia"],"bronchite-aigue":["mal_inf_trop","pedia","pneumo"],"brulure":["derm_venero"],"bursite-orientation":["rhumato"],"bursite-rhumatologie":["rhumato"],"canal-lombaire-retreci-arthrosique":["rhumato","neuro"],"canal-lombaire-retreci-rhumatologie":["rhumato"],"cancer-de-la-prostate-depistage-diagnostic":["urolo"],"candidose":["mal_inf_trop","derm_venero"],"capsulite-retractile":["rhumato"],"carence-en-vitamine-b9":["hemato"],"carence-martiale":["gastro_hépato","med_intern","hemato"],"cassure-staturo-ponderale":["pedia","endo_diab_nutr"],"cephalee-de-tension":["neuro"],"cephalees":["neuro"],"certificat-de-non-contre-indication-a-la-pratique-du-sport":["med_sport"],"cervicalgies":["rhumato","med_trav"],"chalazion":["ophtalmo"],"chondrocalcinose":["rhumato"],"chutes-du-sujet-age":["geria"],"cicatrice-hypertrophique":["derm_venero"],"cirrhose":["gastro_hépato"],"coccygodynies":["rhumato"],"colique-nephretique":["urolo"],"complications-de-lallaitement":["gyneco_med_obst"],"condylomes-ano-genitaux":["mal_inf_trop","gyneco_med_obst"],"conflit-femoro-actebulaire-et-pathologie-du-labrum":["rhumato"],"conflit-ischio-femoral":["rhumato"],"conjonctivite":["mal_inf_trop","ophtalmo"],"conseils-aux-voyageurs":["mal_inf_trop"],"constipation":["gastro_hépato"],"constipation-de-lenfant":["pedia","gastro_hépato"],"contraception-par-anneau-vaginal-gynecologie":["gyneco_med_obst"],"contraception-par-dispositif-intra-uterin-diu-gynecologie":["gyneco_med_obst"],"contraception-par-implant-contraceptif-gynecologie":["gyneco_med_obst"],"contraception-par-patch-oestroprogestatif-gynecologie":["gyneco_med_obst"],"contraception-par-pilule-microprogestative-gynecologie":["gyneco_med_obst"],"contraception-par-pilule-oestroprogestative-gynecologie":["gyneco_med_obst"],"contraceptions-gynecologie":["gyneco_med_obst"],"coqueluche":["mal_inf_trop","pedia","pneumo"],"corticotherapie":["rhumato","derm_venero","med_intern"],"covid":["mal_inf_trop"],"coxarthrose":["rhumato","chir_ortho_trauma"],"crampes":["med_intern","neuro","med_sport"],"criteres-diagnostiques-du-diabete":["endo_diab_nutr"],"csdmard":["rhumato"],"cystite":["mal_inf_trop","urolo"],"demence":["neuro","geria"],"denutrition-de-ladulte":["endo_diab_nutr","geria"],"depistage-cancer-du-col-de-luterus":["gyneco_med_obst"],"depistage-du-cancer-colo-rectal":["gastro_hépato"],"depistage-du-cancer-du-sein":["gyneco_med_obst"],"dermatite-atopique":["derm_venero","allergo"],"dermatite-atopique-du-nourrisson":["derm_venero","pedia","allergo"],"dermatite-seborrheique":["derm_venero"],"dermatophytoses":["mal_inf_trop","derm_venero"],"diabete-de-type-2":["endo_diab_nutr"],"diabete-gestationnel":["gyneco_med_obst","endo_diab_nutr"],"diarhee-aigue":["mal_inf_trop","gastro_hépato"],"diarrhee-chronique":["pedia","gastro_hépato"],"diverticulite-sigmoidienne":["mal_inf_trop","gastro_hépato","chir_visce_dig"],"doigt-a-ressaut":["rhumato"],"dorsalgies":["rhumato","med_trav"],"dorsalgies-rhumatologie":["rhumato"],"douleur-de-l-epaule":["rhumato"],"douleurs-de-fesse-orientation-diagnostique":["rhumato"],"douleurs-neuropathiques":["neuro"],"douleurs-pelviennes-au-cours-de-la-grossesse":["gyneco_med_obst","gastro_hépato","urolo","chir_visce_dig"],"douleurs-pelviennes-de-la-femme-hors-grossesse":["gyneco_med_obst","gastro_hépato","urolo"],"dysfonction-erectile":["urolo"],"dyshidrose":["derm_venero"],"dyslipidemie":["endo_diab_nutr","card_mal_vasc","med_vasc"],"dysmenorrhee":["gyneco_med_obst"],"dyspareunie":["gyneco_med_obst"],"dysphagie":["gastro_hépato","orl_chir_cerv"],"dysphonie":["orl_chir_cerv"],"dyspnee-chonique-post-covid-19":["mal_inf_trop","pneumo"],"dyspnee-sans-signe-dorientation":["pneumo"],"ecoulement-mamelonnaire":["mal_inf_trop","gyneco_med_obst"],"elimination-des-acariens":["allergo"],"elongation-dechirure-musculaire":["med_sport"],"engelure":["derm_venero"],"entorse":["chir_ortho_trauma"],"entorse-du-poignet":["chir_ortho_trauma"],"entorses-doigts":["chir_ortho_trauma","med_sport"],"enuresies":["pedia"],"eosinophilie":["mal_inf_trop","med_intern","hemato"],"epaule-aigue-hyperalgique-rhumatologie":["rhumato"],"epicondylite":["rhumato","chir_ortho_trauma","med_sport","med_trav"],"epicondylite-rhumatologie":["rhumato"],"epigastralgie-dyspepsie":["gastro_hépato"],"epines-calcaneennes":["rhumato"],"episode-depressif-caracterise":["psy"],"epistaxis":["orl_chir_cerv"],"erysipele":["mal_inf_trop","derm_venero"],"erytheme-fessier-du-nourisson":["derm_venero","pedia"],"fecalome":["gastro_hépato","geria"],"fibrome-uterin":["gyneco_med_obst"],"fievre-pendant-la-grossesse":["mal_inf_trop","gyneco_med_obst"],"fievre-sans-point-dappel":["mal_inf_trop","med_intern"],"fissure-anale":["gastro_hépato"],"flush":["derm_venero","med_intern"],"folliculite-superficielle":["mal_inf_trop","derm_venero"],"fracture-de-contrainte-metatarsienne-necrose-avasculaire-de-tete-metatarsienne-freiberg":["rhumato"],"furoncle-anthrax":["mal_inf_trop","derm_venero"],"gale":["mal_inf_trop","derm_venero"],"gastrite":["gastro_hépato"],"gastro-enterites-aigues":["mal_inf_trop","pedia"],"gestes-infiltratifs":["rhumato"],"gonalgies":["rhumato","chir_ortho_trauma"],"goutte":["rhumato"],"goutte-rhumatologie":["rhumato"],"grippe":["mal_inf_trop"],"grossesse-a-bas-risque-examens-systematiques":["gyneco_med_obst"],"gynecomastie":["gyneco_med_obst","pedia","endo_diab_nutr"],"h-pylori":["gastro_hépato"],"hallux-rigidus-sesamoidite-et-metatarsalgie-du-5e-rayon":["rhumato"],"hallux-valgus":["rhumato","chir_ortho_trauma"],"hallux-valgus-rhumatologie":["rhumato"],"hba1c-fructosamine":["endo_diab_nutr","bio_med"],"hematurie":["urolo","nephro"],"herpes":["mal_inf_trop","derm_venero"],"hidradenite-suppuree":["mal_inf_trop","derm_venero"],"hirsutisme":["gyneco_med_obst","endo_diab_nutr"],"hta":["card_mal_vasc","med_vasc"],"hygroma":["rhumato","mal_inf_trop"],"hyperbilirubinemie":["gastro_hépato","hemato"],"hypercalcemie":["rhumato","endo_diab_nutr","bio_med","nephro"],"hyperferritinemie":["gastro_hépato","endo_diab_nutr","med_intern"],"hyperkaliemie":["bio_med","nephro"],"hyperlymphocytose":["mal_inf_trop","bio_med","hemato"],"hypernatremie":["bio_med","nephro"],"hyperphosphoremie":["endo_diab_nutr","bio_med"],"hypersudation":["derm_venero"],"hypertension-arterielle-et-grossesse":["gyneco_med_obst"],"hyperthyroidie":["endo_diab_nutr"],"hypertrophie-de-la-prostate":["urolo"],"hypocalcemie":["rhumato","endo_diab_nutr","nephro"],"hypokaliemie":["bio_med","nephro"],"hypophosphatemie":["gastro_hépato","endo_diab_nutr","bio_med","nephro"],"hypotension-orthostatique":["card_mal_vasc","med_vasc"],"hypothyroidie":["endo_diab_nutr"],"impetigo":["mal_inf_trop","derm_venero"],"incontinence-urinaire":["urolo"],"infection-urinaire-chez-lhomme":["mal_inf_trop","urolo"],"infections-sexuellement-transmissibles-ist-mst":["mal_inf_trop","derm_venero"],"infections-urinaires-chez-la-femme-enceinte":["mal_inf_trop","gyneco_med_obst","urolo"],"infertilite-sterilite":["gyneco_med_obst","endo_diab_nutr"],"inhibiteurs-de-la-pompe-a-protons-ipp":["gastro_hépato"],"insuffisance-renale":["nephro"],"insuffisance-veineuse":["card_mal_vasc","med_vasc"],"intertrigos":["mal_inf_trop","derm_venero"],"ivg-medicamenteuse-en-ambulatoire":["gyneco_med_obst"],"kyste-poplite-rhumatologie":["rhumato"],"kyste-sebace":["derm_venero"],"kyste-synovial":["rhumato"],"la-maladie-de-scheuermann":["pedia","chir_ortho_trauma"],"larmoiements":["ophtalmo"],"laryngite-aigue-de-l-enfant":["mal_inf_trop","pedia","orl_chir_cerv"],"laryngite-aigue-de-ladulte":["mal_inf_trop","orl_chir_cerv"],"leucorrhees":["mal_inf_trop","gyneco_med_obst"],"lichen-plan":["derm_venero"],"lipome":["derm_venero"],"lithiase-biliaire":["gastro_hépato"],"lithiase-urinaire":["urolo"],"lombalgies":["rhumato","med_trav"],"lombalgies-rhumatologie":["rhumato"],"lomboradiculalgies-rhumatologie":["rhumato"],"lucite":["derm_venero"],"lymphoedeme-primaire":["derm_venero","med_vasc"],"maladie-de-dupuytren":["rhumato"],"maladie-de-dupuytren-rhumatologie":["rhumato"],"maladie-de-sever":["pedia","chir_ortho_trauma","med_sport"],"maladie-de-sinding-larsen-johansson":["pedia","chir_ortho_trauma","med_sport"],"maladie-dosgood-schlatter":["pedia","chir_ortho_trauma","med_sport"],"malaises-perte-de-connaisance":["neuro","card_mal_vasc"],"maltraitance-infantile":["pedia"],"mastite-et-abces-mammaire-hors-allaitement":["mal_inf_trop","gyneco_med_obst"],"mastodynie":["gyneco_med_obst"],"menopause":["gyneco_med_obst"],"menorragies-metrorragies":["gyneco_med_obst"],"meralgie-paresthesique":["rhumato"],"metatarsalgies-orientation-diagnostique":["rhumato"],"metatarsalgies-statiques-et-syndrome-du-2e-rayon":["rhumato"],"migraines":["neuro"],"molluscum-contagiosum":["derm_venero"],"molluscum-pendulum":["derm_venero"],"monkeypox-liens-utiles":["mal_inf_trop","derm_venero"],"mononucleose-infectieuse":["mal_inf_trop"],"morsure-griffure-danimal":["mal_inf_trop","derm_venero"],"mtev":["med_intern","pneumo","card_mal_vasc","med_vasc"],"mycose-vaginale":["mal_inf_trop","derm_venero","gyneco_med_obst"],"nausees-vomissements":["pedia","gastro_hépato"],"neutropenie":["med_intern","hemato"],"nevralgie-cervicobrachiale-ncb":["rhumato","neuro","med_trav"],"nevralgie-darnold":["rhumato"],"nevralgie-nevrite":["neuro"],"nevrome-de-morton-et-bursite-intercapito-metatarsienne":["rhumato"],"nodule-thyroidien":["endo_diab_nutr"],"oedemes-des-membres-inferieurs-ou-generalises":["derm_venero","gastro_hépato","med_intern","card_mal_vasc","nephro"],"oeil-rouge-et-ou-douloureux":["ophtalmo"],"ongle-incarne":["derm_venero","chir_ortho_trauma"],"onychomycose":["mal_inf_trop","derm_venero"],"orchi-epididymite":["mal_inf_trop","urolo"],"orgelet":["ophtalmo"],"osteochondrose-osteochondroses":["rhumato","pedia","chir_ortho_trauma","med_sport"],"osteonecrose-aseptique-non-traumatique-rhumatologie":["rhumato"],"osteoporose":["rhumato","geria"],"osteoporose-rhumatologie":["rhumato"],"otalgies":["orl_chir_cerv"],"otite-externe":["mal_inf_trop","orl_chir_cerv"],"otite-moyenne-aigue-adulte":["mal_inf_trop","orl_chir_cerv"],"otite-moyenne-aigue-de-lenfant":["mal_inf_trop","pedia","orl_chir_cerv"],"otite-seromuqueuse":["orl_chir_cerv"],"oxygenotherapie-a-domicile":["pneumo"],"oxyurose":["mal_inf_trop","pedia","gastro_hépato"],"palpitations":["card_mal_vasc"],"panaris":["mal_inf_trop","chir_ortho_trauma"],"paralysie-faciale-idiopathique":["orl_chir_cerv","neuro"],"pathologie-hemorridaire":["gastro_hépato"],"periostite-tibiale":["rhumato","chir_ortho_trauma","med_sport"],"petits-maux-de-la-grossesse":["gyneco_med_obst"],"phimosis":["pedia","urolo"],"pic-monoclonal-gammapathie-monoclonale":["med_intern","hemato"],"piqure-dinsecte":["derm_venero"],"piqures-tiques-lyme":["mal_inf_trop"],"plaie":["derm_venero"],"pneumopathie-aigue-communautaire":["mal_inf_trop","pneumo"],"polyarthrite-rhumatoide":["rhumato"],"premiere-ordonnance-introduction-dinsuline":["endo_diab_nutr"],"prescription-dactivite-physique-adaptee":["endo_diab_nutr","card_mal_vasc","med_sport"],"primo-infection-herpetique":["mal_inf_trop","derm_venero"],"principaux-regimes":["gyneco_med_obst","pedia","endo_diab_nutr","card_mal_vasc","nephro"],"prolapsus-genital":["urolo"],"proteinurie":["med_intern","nephro"],"prurit":["derm_venero","med_intern"],"psa":["urolo","bio_med"],"pseudopolyarthrite-rhizomelique-rhumatologie":["rhumato"],"psoriasis":["derm_venero"],"ptosis-entropion-ectropion":["ophtalmo"],"pubalgie":["rhumato","chir_ortho_trauma","med_sport"],"pyelonephrite-aigue":["mal_inf_trop","urolo"],"pytiriasis-rose-de-gilbert":["derm_venero"],"pytiriasis-versicolor":["derm_venero"],"regime-surpoids":["endo_diab_nutr"],"retard-pubertaire":["pedia","endo_diab_nutr"],"rgo-du-nourrisson":["pedia","gastro_hépato"],"rgo-pyrosis-hernie-hiatale-oesophagite":["gastro_hépato"],"rhinite":["orl_chir_cerv","allergo"],"rhinopharyngite-de-lenfant":["mal_inf_trop","pedia","orl_chir_cerv"],"rhumatisme-a-pyrophosphate-de-calcium-rhumatologie":["rhumato"],"rhumatisme-psoriasique-rhumatologie":["rhumato"],"ronflements":["orl_chir_cerv"],"rosacee":["derm_venero"],"sciatiques-cruralgies":["rhumato","neuro","med_trav"],"sdrc-rhumatologie":["rhumato"],"secheresse-buccale":["derm_venero","med_intern","chir_maxilo_stoma"],"secheresse-occulaire-xerophtalmie":["derm_venero","med_intern","ophtalmo"],"sinusite":["mal_inf_trop","orl_chir_cerv"],"soins-pied-diabetique":["endo_diab_nutr"],"splenectomie":["mal_inf_trop","med_intern"],"spondyloarthrites":["rhumato"],"sterilisation":["gyneco_med_obst","endo_diab_nutr","urolo"],"suites-de-couches":["gyneco_med_obst"],"surdite":["orl_chir_cerv"],"suspicion-dappendicite":["chir_visce_dig"],"syndrome-de-bertolotti":["rhumato"],"syndrome-de-la-bandelette-iliotibiale":["rhumato","chir_ortho_trauma","med_sport"],"syndrome-de-lintestin-irritable-colopathie-fonctionnelle":["gastro_hépato"],"syndrome-de-puranen":["rhumato"],"syndrome-de-raynaud":["derm_venero","med_intern"],"syndrome-des-jambes-sans-repos":["neuro","psy"],"syndrome-des-loges-chronique-du-sportif":["rhumato","chir_ortho_trauma","med_sport"],"syndrome-des-ovaires-polykystiques":["gyneco_med_obst"],"syndrome-du-canal-carpien":["rhumato","neuro","med_trav"],"syndrome-du-defile-cervico-thoraco-brachial":["rhumato"],"syndrome-du-ligament-ilio-lombaire":["rhumato"],"syndrome-fibromyalgique-rhumatologie":["rhumato"],"syndrome-premenstruel":["gyneco_med_obst"],"syndrome-rotulien":["rhumato"],"syndrome-rotulien-rhumatologie":["rhumato"],"syndromes-de-la-traversee-pelvi-femorale":["rhumato"],"syndromes-hemorragiques":["med_intern","hemato"],"syphilis":["mal_inf_trop","derm_venero"],"tabagisme":["pneumo","card_mal_vasc","addicto"],"tendino-bursopathies-trochanteriennes-mecaniques":["rhumato"],"tendinopathie-de-la-coiffe-des-rotateurs":["rhumato"],"tendinopathie-et-bursopathie-achileenne":["rhumato"],"tendinopathie-et-bursopathie-des-muscles-ischio-jambiers":["rhumato"],"tenosynovite-de-de-quervain":["rhumato"],"tetanos-sat-vat":["mal_inf_trop"],"therapies-ciblees":["rhumato"],"thrombopenie":["med_intern","hemato"],"thrombose-veineuse-superficielle":["card_mal_vasc","med_vasc"],"toux-adulte":["pneumo"],"toux-de-lenfant":["pedia","pneumo"],"tremblements":["neuro"],"troponine":["card_mal_vasc"],"troubles-anxieux":["psy"],"troubles-de-la-statique-chez-les-jeunes-enfant":["chir_ortho_trauma"],"troubles-somatoformes":["psy"],"troubles-sommeil":["neuro","psy"],"tumefaction-du-sein":["gyneco_med_obst"],"ulcere-gastro-duodenal":["gastro_hépato"],"uree-plasmatique":["bio_med","nephro"],"uretrite-cervicite":["mal_inf_trop","derm_venero","gyneco_med_obst","urolo"],"urticaire-aigue":["derm_venero","allergo"],"urticaire-chronique":["derm_venero"],"vaccination-enfant":["pedia"],"vaccination-orientation":["mal_inf_trop"],"varicelle":["mal_inf_trop","derm_venero","pedia"],"verrues":["derm_venero"],"vertiges":["orl_chir_cerv","neuro"],"vih":["mal_inf_trop"],"vih-prep":["mal_inf_trop"],"violences-conjugales":["gyneco_med_obst"],"vitamine-b12":["gastro_hépato","med_intern","bio_med","hemato"],"vitamine-d":["rhumato","bio_med"],"vomissements-au-cours-de-la-grossesse":["gyneco_med_obst"],"vppb":["orl_chir_cerv"],"vulvite-vaginite":["mal_inf_trop","gyneco_med_obst"],"zona":["mal_inf_trop","derm_venero"]};

  var EMERGENCY_FICHES = ['sca', 'torsion-du-cordon-spermatique'];
  var EXCLUDED = {};

  var NOT_A_REQUEST = /^(?:divergent|favorable|d[ée]favorable|contraire|de la has|has\b|haute autorit|ansm|du coll[èe]ge|coll[èe]ge|des soci[ée]t[ée]s|du patient|de la patiente|des parents|du m[ée]decin traitant|m[ée]dicaux|en (?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|\d{4}))/i;
  var GENERIC = /^(?:sp[ée]cialis|sp[ée]cialiste|m[ée]decin sp[ée]cialis|m[ée]decin sp[ée]cialiste|ou (?:un )?suivi sp[ée]cialis)/i;
  var URGENT = /urgen|sans d[ée]lai|imm[ée]diat|samu|\bsmur\b|centre 15|appel(?:er)? le 15|hospitalis/i;
  var NOT_URGENT = /sans urgence|non urgente?|pas d'indication en urgence|hors urgence/gi;
  var NAMED = [
    [/^chirurgi(?:e|en|cal) vasculaire/i, 'chir_vasc'], [/^chirurgi(?:e|en|cal) thoracique/i, 'chir_thor_card'],
    [/^cardiolog/i, 'card_mal_vasc'], [/^urolog/i, 'urolo'], [/^(?:orl\b|oto-?rhino)/i, 'orl_chir_cerv'],
    [/^psychiatr/i, 'psy'], [/^ophtalmolog/i, 'ophtalmo'], [/^pneumolog/i, 'pneumo'],
    [/^neurochirurg/i, 'neuro_chir'], [/^(?:neurolog|neurovasculaire)/i, 'neuro'],
    [/^n[ée]phrolog/i, 'nephro'], [/^gyn[ée]colog/i, 'gyneco_med_obst'],
    [/^g[ée]n[ée]ti/i, 'gen_med'], [/^(?:gastro-?ent[ée]rolog|h[ée]patolog|proctolog)/i, 'gastro_hépato'],
    [/^rhumatolog/i, 'rhumato'], [/^infecti/i, 'mal_inf_trop'], [/^allergolog/i, 'allergo'],
    [/^endocrino-?p[ée]diatr/i, 'pedia'], [/^(?:diab[ée]tolog|endocrinolog)/i, 'endo_diab_nutr'],
    [/^addictolog/i, 'addicto'], [/^dermatolog/i, 'derm_venero'], [/^g[ée]riatr/i, 'geria'],
    [/^(?:interniste|m[ée]decine interne)/i, 'med_intern'], [/^h[ée]matolog/i, 'hemato'],
    [/^p[ée]diatr/i, 'pedia'], [/^(?:angiolog|m[ée]decine vasculaire)/i, 'med_vasc']
  ];
  var WORD = "[A-Za-z0-9_\\u00C0-\\u00FF\\u0153\\u0152'\\u2019\\-]+";
  var HEAD = new RegExp(
    "^avis\\s+(?:(?:du|de la|des|de|en|aupr\\u00e8s d['\\u2019]un|aupr\\u00e8s d['\\u2019]une|d['\\u2019]un|d['\\u2019]une)\\s+|(?:de l['\\u2019]|d['\\u2019])\\s*)?" +
    '(' + WORD + '(?:\\s+' + WORD + '){0,3})', 'i');
  var BLOCKS = /^(?:LI|P|TD|TH|CAPTION|DD|DT|H[1-6]|BLOCKQUOTE)$/;
  var SKIP = /^(?:A|BUTTON|SCRIPT|STYLE|TEXTAREA|SELECT)$/;
  var LETTER = /[A-Za-z\u00C0-\u00FF\u0153\u0152]/;

  function previewOn() {
    try {
      var flag = new URLSearchParams(window.location.search).get('omnidoc');
      if (flag === '1') window.localStorage.setItem(PREVIEW_KEY, '1');
      if (flag === '0') window.localStorage.removeItem(PREVIEW_KEY);
      return window.localStorage.getItem(PREVIEW_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function ficheSlug() {
    var m = window.location.pathname.match(/^\/pathologies\/([a-z0-9-]+)\/?$/);
    return m ? m[1] : '';
  }

  function blockOf(node) {
    var el = node.parentNode;
    while (el && el.nodeType === 1 && !BLOCKS.test(el.tagName)) {
      if (el.classList && el.classList.contains('rc-html')) return node.parentNode;
      el = el.parentNode;
    }
    return el && el.nodeType === 1 ? el : node.parentNode;
  }

  function insideSkipped(node, root) {
    for (var el = node.parentNode; el && el !== root; el = el.parentNode) {
      if (el.nodeType === 1 && SKIP.test(el.tagName)) return true;
    }
    return false;
  }

  function clause(text, start, end) {
    var left = Math.max(text.lastIndexOf('. ', start), text.lastIndexOf('; ', start));
    var cuts = [text.indexOf('. ', end), text.indexOf('; ', end)].filter(function(i) { return i !== -1; });
    var right = cuts.length ? Math.min.apply(null, cuts) : text.length;
    return text.slice(left === -1 ? 0 : left + 1, right);
  }

  function classify(follow, sentence) {
    var f = follow.replace(/\s+/g, ' ').toLowerCase();
    if (NOT_A_REQUEST.test(f)) return null;
    var kind = null;
    var code = null;
    var pattern = null;
    if (GENERIC.test(f)) {
      kind = 'generic';
      pattern = /sp[ée]cialis[a-zà-ÿ]*/i;
    } else {
      for (var i = 0; i < NAMED.length; i++) {
        if (NAMED[i][0].test(f)) {
          kind = 'named';
          code = NAMED[i][1].normalize('NFC');
          pattern = NAMED[i][0];
          break;
        }
      }
    }
    if (!kind) return null;
    if (URGENT.test(sentence.replace(NOT_URGENT, ''))) return null;
    return { kind: kind, code: code, pattern: pattern };
  }

  function excluded(slug, sentence) {
    var list = EXCLUDED[slug] || [];
    var s = sentence.replace(/\s+/g, ' ').trim().toLowerCase();
    return list.some(function(prefix) { return s.indexOf(prefix.toLowerCase()) === 0; });
  }

  function findMentions(root, slug) {
    var found = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var seenBlocks = [];
    var node;
    while ((node = walker.nextNode())) {
      if (!/avis/i.test(node.nodeValue) || insideSkipped(node, root)) continue;
      var block = blockOf(node);
      if (seenBlocks.indexOf(block) !== -1) continue;
      seenBlocks.push(block);
      found = found.concat(scanBlock(block, root, slug));
    }
    return found;
  }

  function scanBlock(block, root, slug) {
    var parts = [];
    var text = '';
    var w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) {
      parts.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    text = text.replace(/\u00a0/g, ' ');
    var out = [];
    var re = /avis/gi;
    var m;
    while ((m = re.exec(text))) {
      var start = m.index;
      if (LETTER.test(text.charAt(start - 1)) || LETTER.test(text.charAt(start + 4))) continue;
      var startPart = locate(parts, start);
      if (!startPart || insideSkipped(startPart.node, root) || blockOf(startPart.node) !== block) continue;
      var head = HEAD.exec(text.slice(start, start + 160));
      if (!head) continue;
      var follow = head[1];
      var followStart = head[0].length - follow.length;
      var sentence = clause(text, start, start + head[0].length);
      var hit = classify(follow, sentence);
      if (!hit || excluded(slug, sentence)) continue;
      var key = hit.pattern.exec(follow);
      if (!key) continue;
      var endInFollow = key.index + key[0].length;
      var tail = /^[^\s,;:.()]*/.exec(follow.slice(endInFollow));
      var end = start + followStart + endInFollow + (tail ? tail[0].length : 0);
      var endPart = locate(parts, end - 1);
      if (!endPart || insideSkipped(endPart.node, root)) continue;
      out.push({
        startNode: startPart.node, startOffset: start - startPart.start,
        endNode: endPart.node, endOffset: end - endPart.start,
        kind: hit.kind, code: hit.code
      });
    }
    return out;
  }

  function locate(parts, offset) {
    for (var i = parts.length - 1; i >= 0; i--) {
      if (offset >= parts[i].start && offset < parts[i].start + parts[i].node.nodeValue.length) return parts[i];
    }
    return null;
  }

  function hrefFor(mention, slug) {
    var codes = mention.kind === 'named' ? [mention.code] : (FICHES[slug] || []);
    var qs = [];
    if (codes.length) qs.push('specialites=' + codes.map(encodeURIComponent).join(','));
    qs.push('fiche=' + encodeURIComponent(slug));
    return { href: TARGET + '?' + qs.join('&'), codes: codes };
  }

  function wrap(mention, slug) {
    var range = document.createRange();
    range.setStart(mention.startNode, mention.startOffset);
    range.setEnd(mention.endNode, mention.endOffset);
    var common = range.commonAncestorContainer;
    var el = mention.endNode.parentNode;
    while (el && el !== common && !el.contains(mention.startNode)) {
      range.setEndAfter(el);
      el = el.parentNode;
    }
    var target = hrefFor(mention, slug);
    var a = document.createElement('a');
    a.className = LINK_CLASS;
    a.href = target.href;
    a.setAttribute('data-omnidoc-type', mention.kind);
    a.setAttribute('data-omnidoc-specialites', target.codes.join(','));
    a.title = "Demander un avis sur Omnidoc, partenaire d'Ordotype";
    try {
      range.surroundContents(a);
      return true;
    } catch (e) {
      return false;
    }
  }

  function addStyles() {
    if (document.getElementById('ordo-omnidoc-style')) return;
    var style = document.createElement('style');
    style.id = 'ordo-omnidoc-style';
    style.textContent =
      '.' + LINK_CLASS + '{color:var(--primary-1,#153cf5);text-decoration:underline;text-underline-offset:3px}' +
      '.' + LINK_CLASS + "::after{content:'';display:inline-block;width:.7em;height:.7em;margin-left:.15em;" +
      'vertical-align:.05em;background-color:currentColor;' +
      "-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 17L17 7'/%3E%3Cpath d='M8 7h9v9'/%3E%3C/svg%3E\") no-repeat center/contain;" +
      "mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 17L17 7'/%3E%3Cpath d='M8 7h9v9'/%3E%3C/svg%3E\") no-repeat center/contain}";
    document.head.appendChild(style);
  }

  function track(payload) {
    if (window.OrdoErrorReporter && window.OrdoErrorReporter.track) window.OrdoErrorReporter.track(payload);
  }

  function run() {
    var slug = ficheSlug();
    if (!slug || slug.indexOf('urgences') !== -1 || EMERGENCY_FICHES.indexOf(slug) !== -1) return 0;
    var roots = document.querySelectorAll('.rc-html');
    var mentions = [];
    for (var i = 0; i < roots.length; i++) mentions = mentions.concat(findMentions(roots[i], slug));
    var linked = 0;
    for (var j = mentions.length - 1; j >= 0; j--) {
      if (wrap(mentions[j], slug)) linked++;
    }
    if (linked) {
      addStyles();
      document.addEventListener('click', function(e) {
        var a = e.target && e.target.closest ? e.target.closest('.' + LINK_CLASS) : null;
        if (!a) return;
        track({
          event: 'omnidoc_fiche_link_click',
          omnidoc_fiche: slug,
          omnidoc_type: a.getAttribute('data-omnidoc-type'),
          omnidoc_specialites: a.getAttribute('data-omnidoc-specialites')
        });
      });
    }
    return linked;
  }

  function stillEscaped() {
    var roots = document.querySelectorAll('.rc-html');
    for (var i = 0; i < roots.length; i++) {
      if (/&lt;[a-z]/i.test(roots[i].innerHTML)) return true;
    }
    return false;
  }

  function start() {
    if (window.__ordoOmnidocLinks) return;
    window.__ordoOmnidocLinks = true;
    if (!ENABLED && !previewOn()) return;
    var deadline = Date.now() + 10000;
    (function attempt() {
      if (stillEscaped() && Date.now() < deadline) {
        setTimeout(attempt, 250);
        return;
      }
      try {
        run();
      } catch (err) {
        if (window.OrdoErrorReporter) window.OrdoErrorReporter.report('OmnidocLinks', err);
      }
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
