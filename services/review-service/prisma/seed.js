// Seeds review_db with the same demo reviews as the monolith seed, using
// deterministic ids that line up with the identity-service (user_*) and
// provider-service (prov_*) seeds.
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Optional per-dimension sub-ratings (#528) are set on some reviews and left
// off others, so the profile breakdown shows real dimension averages (over the
// non-null values) next to reviews that only carry an overall score.
const REVIEWS = [
  { id: "rev_1", providerId: "prov_nuwan", userId: "user_dilani", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Fixed my Aqua's brake issue the same day and charged exactly what he quoted. Very honest mechanic." },
  { id: "rev_2", providerId: "prov_nuwan", userId: "user_ashan", rating: 4, quality: 4, punctuality: 3, value: 4, communication: 5, comment: "Good service, explained everything clearly. Workshop gets busy so book ahead." },
  { id: "rev_3", providerId: "prov_sampath", userId: "user_dilani", rating: 5, quality: 5, punctuality: 4, value: 5, communication: 4, comment: "Rewired our entire house in Kadawatha. Neat work, proper earthing, passed inspection first time." },
  { id: "rev_4", providerId: "prov_kumari", userId: "user_tharindu", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Kumari transformed our bare backyard into a beautiful tropical garden. Worth every rupee." },
  { id: "rev_5", providerId: "prov_kumari", userId: "user_ashan", rating: 5, comment: "Very knowledgeable about native plants. The garden survived the dry season perfectly." },
  { id: "rev_6", providerId: "prov_roshan", userId: "user_tharindu", rating: 4, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Came within two hours for a burst pipe. Tidy and fast." },
  { id: "rev_7", providerId: "prov_chaminda", userId: "user_dilani", rating: 5, comment: "The pantry cupboards are stunning. Real craftsmanship you rarely see these days." },
];


const NEW_REVIEWS = [
  { id: "rev_8", providerId: "prov_nuwan", userId: "user_c012", rating: 5, comment: "Excellent work — showed up on time and the engine diagnostics was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_9", providerId: "prov_sampath", userId: "user_c030", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Very professional. Explained the circuit breaker installation clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_10", providerId: "prov_kumari", userId: "user_c018", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Best garden designer I've used in Kandy. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_11", providerId: "prov_roshan", userId: "user_c006", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The pipe replacement (per meter) has held up well since.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_12", providerId: "prov_rizwan", userId: "user_c024", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_13", providerId: "prov_chaminda", userId: "user_c012", rating: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_14", providerId: "prov_p007", userId: "user_c030", rating: 5, quality: 4, punctuality: 5, value: 5, communication: 4, comment: "Excellent work — showed up on time and the brake pad replacement was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_15", providerId: "prov_p008", userId: "user_c018", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the ceiling fan installation clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_16", providerId: "prov_p009", userId: "user_c006", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Best plumber I've used in Kalutara. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_17", providerId: "prov_p010", userId: "user_c024", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The roof timber repair has held up well since.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_18", providerId: "prov_p011", userId: "user_c012", rating: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_19", providerId: "prov_p012", userId: "user_c030", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_20", providerId: "prov_p013", userId: "user_c018", rating: 4, quality: 3, punctuality: 2, value: 4, communication: 3, comment: "Excellent work — showed up on time and the tree pruning was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_21", providerId: "prov_p014", userId: "user_c006", rating: 4, quality: 4, punctuality: 3, value: 3, communication: 4, comment: "Very professional. Explained the compressor repair clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_22", providerId: "prov_p015", userId: "user_c024", rating: 4, quality: 5, punctuality: 4, value: 4, communication: 4, comment: "Best appliance repair I've used in Hambantota. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_23", providerId: "prov_p016", userId: "user_c012", rating: 4, comment: "Quick response and tidy work. The gate fabrication has held up well since.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_24", providerId: "prov_p017", userId: "user_c030", rating: 4, quality: 4, punctuality: 2, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_25", providerId: "prov_p018", userId: "user_c018", rating: 3, quality: 4, punctuality: 2, value: 2, communication: 3, comment: "Did the tile regrouting well. Price was a touch higher than I expected but quality justified it.", photos: [] },
  { id: "rev_26", providerId: "prov_p019", userId: "user_c006", rating: 3, quality: 2, punctuality: 3, value: 3, communication: 2, comment: "Good work overall on the camera repair/replacement, just took a bit longer than expected to schedule.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_27", providerId: "prov_p020", userId: "user_c024", rating: 2, quality: 2, punctuality: 3, value: 1, communication: 2, comment: "Had to call back twice about the same issue with the bed bug treatment before it was fully sorted.", photos: [] },
  { id: "rev_28", providerId: "prov_p021", userId: "user_c012", rating: 5, comment: "Best cleaning I've used in Puttalam. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_29", providerId: "prov_p022", userId: "user_c030", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The office relocation has held up well since.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_30", providerId: "prov_p023", userId: "user_c018", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_31", providerId: "prov_p024", userId: "user_c006", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_32", providerId: "prov_p025", userId: "user_c024", rating: 5, quality: 4, punctuality: 3, value: 5, communication: 4, comment: "Excellent work — showed up on time and the blocked drain clearing was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_33", providerId: "prov_p026", userId: "user_c012", rating: 5, comment: "Very professional. Explained the custom wardrobe build clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_34", providerId: "prov_p027", userId: "user_c030", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Best mason I've used in Colombo. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_35", providerId: "prov_p028", userId: "user_c018", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The wood varnishing has held up well since.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_36", providerId: "prov_p029", userId: "user_c006", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_37", providerId: "prov_p030", userId: "user_c024", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_38", providerId: "prov_p031", userId: "user_c012", rating: 5, comment: "Excellent work — showed up on time and the washing machine repair was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_39", providerId: "prov_p032", userId: "user_c030", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the window grill fabrication clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_40", providerId: "prov_p033", userId: "user_c018", rating: 4, quality: 5, punctuality: 2, value: 4, communication: 4, comment: "Best roofer I've used in Galle. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_41", providerId: "prov_p034", userId: "user_c006", rating: 4, quality: 3, punctuality: 3, value: 3, communication: 3, comment: "Quick response and tidy work. The kitchen backsplash tiling has held up well since.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_42", providerId: "prov_p035", userId: "user_c024", rating: 4, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_43", providerId: "prov_p036", userId: "user_c012", rating: 4, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_44", providerId: "prov_p037", userId: "user_c030", rating: 4, quality: 3, punctuality: 2, value: 4, communication: 3, comment: "Excellent work — showed up on time and the sofa/carpet shampooing was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_45", providerId: "prov_p038", userId: "user_c018", rating: 3, quality: 3, punctuality: 2, value: 2, communication: 3, comment: "Solid job, communication could've been a little faster but the end result was fine.", photos: [] },
  { id: "rev_46", providerId: "prov_p039", userId: "user_c006", rating: 3, quality: 4, punctuality: 3, value: 3, communication: 3, comment: "Did the ac gas refill well. Price was a touch higher than I expected but quality justified it.", photos: [] },
  { id: "rev_47", providerId: "prov_p040", userId: "user_c024", rating: 2, quality: 1, punctuality: 3, value: 1, communication: 1, comment: "Had to call back twice about the same issue with the inverter/solar wiring before it was fully sorted.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_48", providerId: "prov_p041", userId: "user_c012", rating: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_49", providerId: "prov_p042", userId: "user_c030", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_50", providerId: "prov_p043", userId: "user_c018", rating: 5, quality: 4, punctuality: 5, value: 5, communication: 4, comment: "Excellent work — showed up on time and the tiling foundation work was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_51", providerId: "prov_p044", userId: "user_c006", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the waterproof coating clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_52", providerId: "prov_p045", userId: "user_c024", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Best garden designer I've used in Ratnapura. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_53", providerId: "prov_p046", userId: "user_c012", rating: 5, comment: "Quick response and tidy work. The ac gas refill + service has held up well since.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_54", providerId: "prov_p047", userId: "user_c030", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_55", providerId: "prov_p048", userId: "user_c018", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_56", providerId: "prov_p049", userId: "user_c006", rating: 5, quality: 4, punctuality: 3, value: 5, communication: 4, comment: "Excellent work — showed up on time and the full re-roofing (per sq ft) was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_57", providerId: "prov_p050", userId: "user_c024", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Very professional. Explained the outdoor tiling clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_58", providerId: "prov_nuwan", userId: "user_c023", rating: 5, comment: "Best mechanic I've used in Colombo. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_59", providerId: "prov_sampath", userId: "user_c011", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The circuit breaker installation has held up well since.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_60", providerId: "prov_kumari", userId: "user_c029", rating: 4, quality: 4, punctuality: 2, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_61", providerId: "prov_roshan", userId: "user_c017", rating: 4, quality: 5, punctuality: 3, value: 3, communication: 4, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_62", providerId: "prov_rizwan", userId: "user_c005", rating: 4, quality: 3, punctuality: 4, value: 4, communication: 3, comment: "Excellent work — showed up on time and the duct cleaning was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_63", providerId: "prov_chaminda", userId: "user_c023", rating: 4, comment: "Very professional. Explained the custom wardrobe build clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_64", providerId: "prov_p007", userId: "user_c011", rating: 4, quality: 5, punctuality: 2, value: 4, communication: 4, comment: "Best mechanic I've used in Colombo. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_65", providerId: "prov_p008", userId: "user_c029", rating: 3, quality: 2, punctuality: 2, value: 2, communication: 2, comment: "Good work overall on the ceiling fan installation, just took a bit longer than expected to schedule.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_66", providerId: "prov_p009", userId: "user_c017", rating: 3, quality: 3, punctuality: 3, value: 3, communication: 3, comment: "Solid job, communication could've been a little faster but the end result was fine.", photos: [] },
  { id: "rev_67", providerId: "prov_p010", userId: "user_c005", rating: 2, quality: 3, punctuality: 3, value: 1, communication: 2, comment: "Had to call back twice about the same issue with the roof timber repair before it was fully sorted.", photos: [] },
  { id: "rev_68", providerId: "prov_p011", userId: "user_c023", rating: 5, comment: "Excellent work — showed up on time and the wall construction (per sq ft) was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_69", providerId: "prov_p012", userId: "user_c011", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Very professional. Explained the exterior house painting clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_70", providerId: "prov_p013", userId: "user_c029", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Best garden designer I've used in Galle. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_71", providerId: "prov_p014", userId: "user_c017", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The compressor repair has held up well since.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_72", providerId: "prov_p015", userId: "user_c005", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_73", providerId: "prov_p016", userId: "user_c023", rating: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_74", providerId: "prov_p017", userId: "user_c011", rating: 5, quality: 4, punctuality: 5, value: 5, communication: 4, comment: "Excellent work — showed up on time and the roof leak repair was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_75", providerId: "prov_p018", userId: "user_c029", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the tile regrouting clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_76", providerId: "prov_p019", userId: "user_c017", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Best cctv security I've used in Ampara. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_77", providerId: "prov_p020", userId: "user_c005", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The bed bug treatment has held up well since.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_78", providerId: "prov_p021", userId: "user_c023", rating: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_79", providerId: "prov_p022", userId: "user_c011", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_80", providerId: "prov_p023", userId: "user_c029", rating: 4, quality: 3, punctuality: 2, value: 4, communication: 3, comment: "Excellent work — showed up on time and the full oil change service was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_81", providerId: "prov_p024", userId: "user_c017", rating: 4, quality: 4, punctuality: 3, value: 3, communication: 4, comment: "Very professional. Explained the emergency callout clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_82", providerId: "prov_p025", userId: "user_c005", rating: 4, quality: 5, punctuality: 4, value: 4, communication: 4, comment: "Best plumber I've used in Ratnapura. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_83", providerId: "prov_p026", userId: "user_c023", rating: 4, comment: "Quick response and tidy work. The custom wardrobe build has held up well since.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_84", providerId: "prov_p027", userId: "user_c011", rating: 4, quality: 4, punctuality: 2, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_85", providerId: "prov_p028", userId: "user_c029", rating: 3, quality: 4, punctuality: 2, value: 2, communication: 3, comment: "Did the wood varnishing well. Price was a touch higher than I expected but quality justified it.", photos: [] },
  { id: "rev_86", providerId: "prov_p029", userId: "user_c017", rating: 3, quality: 2, punctuality: 3, value: 3, communication: 2, comment: "Good work overall on the irrigation system setup, just took a bit longer than expected to schedule.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_87", providerId: "prov_p030", userId: "user_c005", rating: 2, quality: 2, punctuality: 3, value: 1, communication: 2, comment: "Had to call back twice about the same issue with the duct cleaning before it was fully sorted.", photos: [] },
  { id: "rev_88", providerId: "prov_p031", userId: "user_c023", rating: 5, comment: "Best appliance repair I've used in Matale. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_89", providerId: "prov_p032", userId: "user_c011", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The window grill fabrication has held up well since.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_90", providerId: "prov_p033", userId: "user_c029", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_91", providerId: "prov_p034", userId: "user_c017", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_92", providerId: "prov_p035", userId: "user_c005", rating: 5, quality: 4, punctuality: 3, value: 5, communication: 4, comment: "Excellent work — showed up on time and the remote monitoring setup was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_93", providerId: "prov_p036", userId: "user_c023", rating: 5, comment: "Very professional. Explained the full house pest treatment clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_94", providerId: "prov_p037", userId: "user_c011", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Best cleaning I've used in Batticaloa. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_95", providerId: "prov_p038", userId: "user_c029", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The single item delivery has held up well since.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_96", providerId: "prov_p039", userId: "user_c017", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_97", providerId: "prov_p040", userId: "user_c005", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_98", providerId: "prov_p041", userId: "user_c023", rating: 5, comment: "Excellent work — showed up on time and the leak repair was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_99", providerId: "prov_p042", userId: "user_c011", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the door/window frame repair clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_100", providerId: "prov_p043", userId: "user_c029", rating: 4, quality: 5, punctuality: 2, value: 4, communication: 4, comment: "Best mason I've used in Polonnaruwa. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_101", providerId: "prov_p044", userId: "user_c017", rating: 4, quality: 3, punctuality: 3, value: 3, communication: 3, comment: "Quick response and tidy work. The waterproof coating has held up well since.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_102", providerId: "prov_p045", userId: "user_c005", rating: 4, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_103", providerId: "prov_p046", userId: "user_c023", rating: 4, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_104", providerId: "prov_p047", userId: "user_c011", rating: 4, quality: 3, punctuality: 2, value: 4, communication: 3, comment: "Excellent work — showed up on time and the refrigerator repair was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_105", providerId: "prov_p048", userId: "user_c029", rating: 3, quality: 3, punctuality: 2, value: 2, communication: 3, comment: "Solid job, communication could've been a little faster but the end result was fine.", photos: [] },
  { id: "rev_106", providerId: "prov_p049", userId: "user_c017", rating: 3, quality: 4, punctuality: 3, value: 3, communication: 3, comment: "Did the full re-roofing (per sq ft) well. Price was a touch higher than I expected but quality justified it.", photos: [] },
  { id: "rev_107", providerId: "prov_p050", userId: "user_c005", rating: 2, quality: 1, punctuality: 3, value: 1, communication: 1, comment: "Had to call back twice about the same issue with the outdoor tiling before it was fully sorted.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_108", providerId: "prov_nuwan", userId: "user_c004", rating: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_109", providerId: "prov_sampath", userId: "user_c022", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_110", providerId: "prov_kumari", userId: "user_c010", rating: 5, quality: 4, punctuality: 5, value: 5, communication: 4, comment: "Excellent work — showed up on time and the tree pruning was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_111", providerId: "prov_roshan", userId: "user_c028", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the pipe replacement (per meter) clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_112", providerId: "prov_rizwan", userId: "user_c016", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Best ac repair I've used in Colombo. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_113", providerId: "prov_chaminda", userId: "user_c004", rating: 5, comment: "Quick response and tidy work. The custom wardrobe build has held up well since.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_114", providerId: "prov_p007", userId: "user_c022", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_115", providerId: "prov_p008", userId: "user_c010", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_116", providerId: "prov_p009", userId: "user_c028", rating: 5, quality: 4, punctuality: 3, value: 5, communication: 4, comment: "Excellent work — showed up on time and the pipe replacement (per meter) was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_117", providerId: "prov_p010", userId: "user_c016", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Very professional. Explained the roof timber repair clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_118", providerId: "prov_p011", userId: "user_c004", rating: 5, comment: "Best mason I've used in Matale. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_119", providerId: "prov_p012", userId: "user_c022", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The exterior house painting has held up well since.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_120", providerId: "prov_p013", userId: "user_c010", rating: 4, quality: 4, punctuality: 2, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_121", providerId: "prov_p014", userId: "user_c028", rating: 4, quality: 5, punctuality: 3, value: 3, communication: 4, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_122", providerId: "prov_p015", userId: "user_c016", rating: 4, quality: 3, punctuality: 4, value: 4, communication: 3, comment: "Excellent work — showed up on time and the mixer/blender repair was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_123", providerId: "prov_p016", userId: "user_c004", rating: 4, comment: "Very professional. Explained the gate fabrication clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_124", providerId: "prov_p017", userId: "user_c022", rating: 4, quality: 5, punctuality: 2, value: 4, communication: 4, comment: "Best roofer I've used in Batticaloa. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_125", providerId: "prov_p018", userId: "user_c010", rating: 3, quality: 2, punctuality: 2, value: 2, communication: 2, comment: "Good work overall on the tile regrouting, just took a bit longer than expected to schedule.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_126", providerId: "prov_p019", userId: "user_c028", rating: 3, quality: 3, punctuality: 3, value: 3, communication: 3, comment: "Solid job, communication could've been a little faster but the end result was fine.", photos: [] },
  { id: "rev_127", providerId: "prov_p020", userId: "user_c016", rating: 2, quality: 3, punctuality: 3, value: 1, communication: 2, comment: "Had to call back twice about the same issue with the bed bug treatment before it was fully sorted.", photos: [] },
  { id: "rev_128", providerId: "prov_p021", userId: "user_c004", rating: 5, comment: "Excellent work — showed up on time and the full house deep cleaning was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-01.jpg"] },
  { id: "rev_129", providerId: "prov_p022", userId: "user_c022", rating: 5, quality: 5, punctuality: 4, value: 4, communication: 5, comment: "Very professional. Explained the office relocation clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_130", providerId: "prov_p023", userId: "user_c010", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Best mechanic I've used in Polonnaruwa. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_131", providerId: "prov_p024", userId: "user_c028", rating: 5, quality: 4, punctuality: 5, value: 4, communication: 4, comment: "Quick response and tidy work. The emergency callout has held up well since.", photos: ["/uploads/seed/review-pool/review-16.jpg","/uploads/seed/review-pool/review-03.jpg"] },
  { id: "rev_132", providerId: "prov_p025", userId: "user_c016", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_133", providerId: "prov_p026", userId: "user_c004", rating: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_134", providerId: "prov_p027", userId: "user_c022", rating: 5, quality: 4, punctuality: 5, value: 5, communication: 4, comment: "Excellent work — showed up on time and the plastering was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-07.jpg"] },
  { id: "rev_135", providerId: "prov_p028", userId: "user_c010", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Very professional. Explained the wood varnishing clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_136", providerId: "prov_p029", userId: "user_c028", rating: 5, quality: 5, punctuality: 3, value: 5, communication: 5, comment: "Best garden designer I've used in Kalutara. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_137", providerId: "prov_p030", userId: "user_c016", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The duct cleaning has held up well since.", photos: ["/uploads/seed/review-pool/review-22.jpg","/uploads/seed/review-pool/review-09.jpg"] },
  { id: "rev_138", providerId: "prov_p031", userId: "user_c004", rating: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_139", providerId: "prov_p032", userId: "user_c022", rating: 5, quality: 5, punctuality: 5, value: 4, communication: 5, comment: "Solved a problem two other people couldn't figure out. Great communication throughout.", photos: [] },
  { id: "rev_140", providerId: "prov_p033", userId: "user_c010", rating: 4, quality: 3, punctuality: 2, value: 4, communication: 3, comment: "Excellent work — showed up on time and the gutter installation was done properly. Would hire again.", photos: ["/uploads/seed/review-pool/review-13.jpg"] },
  { id: "rev_141", providerId: "prov_p034", userId: "user_c028", rating: 4, quality: 4, punctuality: 3, value: 3, communication: 4, comment: "Very professional. Explained the kitchen backsplash tiling clearly before starting and stuck to the quoted price.", photos: [] },
  { id: "rev_142", providerId: "prov_p035", userId: "user_c016", rating: 4, quality: 5, punctuality: 4, value: 4, communication: 4, comment: "Best cctv security I've used in Hambantota. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_143", providerId: "prov_p036", userId: "user_c004", rating: 4, comment: "Quick response and tidy work. The full house pest treatment has held up well since.", photos: ["/uploads/seed/review-pool/review-04.jpg","/uploads/seed/review-pool/review-15.jpg"] },
  { id: "rev_144", providerId: "prov_p037", userId: "user_c022", rating: 4, quality: 4, punctuality: 2, value: 4, communication: 4, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
  { id: "rev_145", providerId: "prov_p038", userId: "user_c010", rating: 3, quality: 4, punctuality: 2, value: 2, communication: 3, comment: "Did the single item delivery well. Price was a touch higher than I expected but quality justified it.", photos: [] },
  { id: "rev_146", providerId: "prov_p039", userId: "user_c028", rating: 3, quality: 2, punctuality: 3, value: 3, communication: 2, comment: "Good work overall on the ac gas refill, just took a bit longer than expected to schedule.", photos: ["/uploads/seed/review-pool/review-19.jpg"] },
  { id: "rev_147", providerId: "prov_p040", userId: "user_c016", rating: 2, quality: 2, punctuality: 3, value: 1, communication: 2, comment: "Had to call back twice about the same issue with the inverter/solar wiring before it was fully sorted.", photos: [] },
  { id: "rev_148", providerId: "prov_p041", userId: "user_c004", rating: 5, comment: "Best plumber I've used in Puttalam. Highly recommend for anyone nearby.", photos: [] },
  { id: "rev_149", providerId: "prov_p042", userId: "user_c022", rating: 5, quality: 4, punctuality: 4, value: 4, communication: 4, comment: "Quick response and tidy work. The door/window frame repair has held up well since.", photos: ["/uploads/seed/review-pool/review-10.jpg","/uploads/seed/review-pool/review-21.jpg"] },
  { id: "rev_150", providerId: "prov_p043", userId: "user_c010", rating: 5, quality: 5, punctuality: 5, value: 5, communication: 5, comment: "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.", photos: [] },
];

const NEW_RESPONSES = [
  { reviewId: "rev_8", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_11", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_14", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_17", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_20", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_23", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_26", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_29", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_32", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_35", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_38", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_41", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_44", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_47", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_50", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_53", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_56", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_59", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_62", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_65", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_68", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_71", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_74", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_77", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_80", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_83", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_86", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_89", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_92", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_95", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_98", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_101", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_104", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_107", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_110", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_113", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_116", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_119", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_122", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_125", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_128", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_131", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_134", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_137", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_140", text: "Thanks for choosing me for this job, and for the honest feedback." },
  { reviewId: "rev_143", text: "Thank you for the kind words — really appreciate you taking the time to review!" },
  { reviewId: "rev_146", text: "Glad it worked out well. Feel free to reach out again if you need anything else." },
  { reviewId: "rev_149", text: "Thanks for choosing me for this job, and for the honest feedback." },
];

// Provider responses (#395): a couple of reviews carry a public reply from the
// reviewed provider so the profile shows the response block in demos.
const RESPONSES = [
  { reviewId: "rev_1", text: "Thank you Dilani! Glad the brakes are sorted — see you at the next service." },
  { reviewId: "rev_4", text: "It was a pleasure working on your garden. Water the ferns twice a week during the dry months!" },
];

// ---------------------------------------------------------------------------
// #632 seed-data expansion — batch 2 ("demo everything" scale). GENERATED
// reviews rev_151..rev_500 continue the rev_N scheme, spread realistically
// across all 150 seeded providers by the full 100-customer set. Sub-dimensions
// (#528) on ~2/3, photos on ~1/3 (cycling the review-pool), and provider
// responses (#395) on ~40%. Every (providerId,userId) pair is unique (schema
// @@unique) — collisions with the hard-coded reviews above are skipped.
// ---------------------------------------------------------------------------
const pad3 = (n) => String(n).padStart(3, "0");
const ALL_PROVIDER_IDS = [
  "prov_nuwan", "prov_sampath", "prov_kumari", "prov_roshan", "prov_rizwan", "prov_chaminda",
  ...Array.from({ length: 144 }, (_, k) => `prov_p${pad3(k + 7)}`),
];
const ALL_CUSTOMER_IDS = [
  "user_dilani", "user_ashan", "user_tharindu",
  ...Array.from({ length: 27 }, (_, k) => `user_c${pad3(k + 4)}`),
  ...Array.from({ length: 70 }, (_, k) => `user_c${pad3(k + 31)}`),
];
const RATING_PATTERN = [5, 5, 4, 5, 4, 3, 5, 4, 5, 2, 5, 4, 3, 5, 4, 1, 5, 4, 5, 3];
const REVIEW_COMMENTS = [
  "Excellent work — showed up on time and everything was done properly. Would hire again.",
  "Very professional. Explained the job clearly before starting and stuck to the quoted price.",
  "Best in the area I've worked with. Highly recommend for anyone nearby.",
  "Quick response and tidy work. It has held up well since.",
  "Reasonable pricing and honest advice — didn't try to upsell anything I didn't need.",
  "Solved a problem two other people couldn't figure out. Great communication throughout.",
  "Solid job, communication could've been a little faster but the end result was fine.",
  "Did the work well. Price was a touch higher than I expected but quality justified it.",
  "Good work overall, just took a bit longer than expected to schedule.",
  "Had to call back once about a small issue but it was sorted quickly.",
];
const RESPONSE_TEXTS = [
  "Thank you for the kind words — really appreciate you taking the time to review!",
  "Glad it worked out well. Feel free to reach out again if you need anything else.",
  "Thanks for choosing me for this job, and for the honest feedback.",
];
const clamp = (n) => Math.max(1, Math.min(5, n));
const usedPairs = new Set([...REVIEWS, ...NEW_REVIEWS].map((r) => `${r.providerId}|${r.userId}`));
const GEN_REVIEWS = [];
const GEN_RESPONSES = [];
{
  let rid = 151;
  let k = 0;
  while (GEN_REVIEWS.length < 350 && k < 100000) {
    const providerId = ALL_PROVIDER_IDS[k % ALL_PROVIDER_IDS.length];
    let placed = null;
    for (let off = 0; off < ALL_CUSTOMER_IDS.length; off++) {
      const userId = ALL_CUSTOMER_IDS[(k * 13 + off) % ALL_CUSTOMER_IDS.length];
      const key = `${providerId}|${userId}`;
      if (!usedPairs.has(key)) { usedPairs.add(key); placed = userId; break; }
    }
    k++;
    if (!placed) continue;
    const id = `rev_${rid++}`;
    const idx = GEN_REVIEWS.length;
    const rating = RATING_PATTERN[idx % RATING_PATTERN.length];
    const withDims = idx % 3 !== 0;
    const withPhotos = idx % 3 === 0;
    const review = {
      id,
      providerId,
      userId: placed,
      rating,
      comment: REVIEW_COMMENTS[idx % REVIEW_COMMENTS.length],
      photos: withPhotos
        ? [
            `/uploads/seed/review-pool/review-${String((idx % 24) + 1).padStart(2, "0")}.jpg`,
            ...(idx % 6 === 0 ? [`/uploads/seed/review-pool/review-${String(((idx + 11) % 24) + 1).padStart(2, "0")}.jpg`] : []),
          ]
        : [],
    };
    if (withDims) {
      review.quality = clamp(rating + ((idx % 3) - 1));
      review.punctuality = clamp(rating - (idx % 2));
      review.value = clamp(rating + ((idx % 2) === 0 ? 0 : -1));
      review.communication = clamp(rating - ((idx % 3) - 1));
    }
    GEN_REVIEWS.push(review);
    // Provider responses (#395) on ~40% of the generated reviews.
    if (idx % 5 < 2) {
      GEN_RESPONSES.push({ reviewId: id, text: RESPONSE_TEXTS[idx % RESPONSE_TEXTS.length] });
    }
  }
}

async function main() {
  // This is DUMMY demo data (fake reviews, photos, responses) — it must
  // never reach a production database. Same guard as identity-service.
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO_DATA !== "true") {
    console.error(
      "Refusing to seed demo reviews with NODE_ENV=production " +
        "(set SEED_DEMO_DATA=true to override deliberately)."
    );
    process.exit(1);
  }

  await db.reviewPhoto.deleteMany();
  await db.review.deleteMany(); // responses cascade with their reviews

  for (const r of REVIEWS) {
    await db.review.create({ data: r });
  }

  // NEW_REVIEWS + GEN_REVIEWS (#632 seed-data expansion) carry a `photos`
  // array of URLs — strip it before the scalar create, then insert as
  // ReviewPhoto rows.
  for (const r of [...NEW_REVIEWS, ...GEN_REVIEWS]) {
    const { photos, ...reviewData } = r;
    await db.review.create({ data: reviewData });
    for (const url of photos) {
      await db.reviewPhoto.create({ data: { reviewId: r.id, url } });
    }
  }

  for (const resp of [...RESPONSES, ...NEW_RESPONSES, ...GEN_RESPONSES]) {
    await db.reviewResponse.create({ data: resp });
  }

  const totalReviews = REVIEWS.length + NEW_REVIEWS.length + GEN_REVIEWS.length;
  const totalResponses = RESPONSES.length + NEW_RESPONSES.length + GEN_RESPONSES.length;
  const totalPhotos = [...NEW_REVIEWS, ...GEN_REVIEWS].reduce((n, r) => n + r.photos.length, 0);
  console.log(
    `Seeded ${totalReviews} reviews, ${totalResponses} responses, ${totalPhotos} review photos.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
