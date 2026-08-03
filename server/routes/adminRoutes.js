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
  facultyValidators,
  getCatalogue,
  materialValidators,
  placementValidators,
  programmeValidators,
  removePlacement,
  subjectValidators,
  updateFaculty,
  updateMaterial,
  updateProgramme,
  updateSubject,
  updateYear,
  yearValidators,
} from "../controllers/adminController.js";
import { requireOperator } from "../middleware/authMiddleware.js";

const router = Router();

// The whole section is operator-only. The client confirmed operators administer the
// catalogue themselves, so no separate admin role exists.
router.use(requireOperator);

router.get("/catalogue", getCatalogue);

router.post("/faculties", facultyValidators, createFaculty);
router.patch("/faculties/:id", facultyValidators, updateFaculty);
router.delete("/faculties/:id", deleteFaculty);

router.post("/programmes", programmeValidators, createProgramme);
router.patch("/programmes/:id", programmeValidators, updateProgramme);
router.delete("/programmes/:id", deleteProgramme);

router.post("/years", yearValidators, createYear);
router.patch("/years/:id", yearValidators, updateYear);
router.delete("/years/:id", deleteYear);

router.post("/subjects", subjectValidators, createSubject);
router.patch("/subjects/:id", subjectValidators, updateSubject);
router.delete("/subjects/:id", deleteSubject);

router.post("/materials", materialValidators, createMaterial);
router.patch("/materials/:id", materialValidators, updateMaterial);
router.delete("/materials/:id", deleteMaterial);

// Where a material appears. One material may hold several placements.
router.post("/materials/:id/placements", placementValidators, addPlacement);
router.delete("/materials/:id/placements/:placementId", removePlacement);

export default router;
