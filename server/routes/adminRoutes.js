import { Router } from "express";
import {
  addPlacement,
  createFaculty,
  createMaterial,
  createProgramme,
  createSubject,
  createYear,
  deleteFaculty,
  deleteMaterial,
  deleteProgramme,
  deleteSubject,
  deleteYear,
  facultyCreateValidators,
  facultyUpdateValidators,
  getCatalogue,
  materialCreateValidators,
  materialUpdateValidators,
  placementValidators,
  programmeCreateValidators,
  programmeUpdateValidators,
  removePlacement,
  subjectCreateValidators,
  subjectUpdateValidators,
  updateFaculty,
  updateMaterial,
  updateProgramme,
  updateSubject,
  updateYear,
  yearCreateValidators,
  yearUpdateValidators,
} from "../controllers/adminController.js";
import { requireOperator } from "../middleware/authMiddleware.js";

const router = Router();

// The whole section is operator-only. The client confirmed operators administer the
// catalogue themselves, so no separate admin role exists.
router.use(requireOperator);

router.get("/catalogue", getCatalogue);

// POST requires the identifying field; PATCH is a partial update where every field is
// optional, so that e.g. changing only a price is possible.
router.post("/faculties", facultyCreateValidators, createFaculty);
router.patch("/faculties/:id", facultyUpdateValidators, updateFaculty);
router.delete("/faculties/:id", deleteFaculty);

router.post("/programmes", programmeCreateValidators, createProgramme);
router.patch("/programmes/:id", programmeUpdateValidators, updateProgramme);
router.delete("/programmes/:id", deleteProgramme);

router.post("/years", yearCreateValidators, createYear);
router.patch("/years/:id", yearUpdateValidators, updateYear);
router.delete("/years/:id", deleteYear);

router.post("/subjects", subjectCreateValidators, createSubject);
router.patch("/subjects/:id", subjectUpdateValidators, updateSubject);
router.delete("/subjects/:id", deleteSubject);

router.post("/materials", materialCreateValidators, createMaterial);
router.patch("/materials/:id", materialUpdateValidators, updateMaterial);
router.delete("/materials/:id", deleteMaterial);

// Where a material appears. One material may hold several placements.
router.post("/materials/:id/placements", placementValidators, addPlacement);
router.delete("/materials/:id/placements/:placementId", removePlacement);

export default router;
