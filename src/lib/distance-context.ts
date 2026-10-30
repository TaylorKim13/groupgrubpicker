import { createContext, useContext } from "react";
import type { DistanceUnit } from "./settings";

export const DistanceContext = createContext<DistanceUnit>("mi");
export const useDistanceUnit = () => useContext(DistanceContext);
