import test from "node:test";
import assert from "node:assert/strict";
import {googlePriceLabel, directionsUrl} from "../src/lib/restaurant-info.ts";
test("missing prices stay unknown",()=>assert.equal(googlePriceLabel({}),null));
test("Google currency ranges and open ranges",()=>{
 assert.equal(googlePriceLabel({priceRange:{startPrice:{currencyCode:"USD",units:"10"},endPrice:{currencyCode:"USD",units:"25"}}}),"$10–$25");
 assert.equal(googlePriceLabel({priceRange:{startPrice:{currencyCode:"USD",units:"50"}}}),"$50+");
 assert.equal(googlePriceLabel({priceRange:{startPrice:{currencyCode:"USD",units:"10"},endPrice:{currencyCode:"EUR",units:"20"}}}),null);
});
test("directions preserve coordinates",()=>assert.equal(new URL(directionsUrl({lat:40.23,lng:-111.65})).searchParams.get("destination"),"40.23,-111.65"));
