const express = require("express");
const {
  getAllUsers,
  getManagers,
  setUserRole,
  createManager,
  deleteUser,
} = require("../controllers/userController");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(protect, adminOnly);

router.get("/", getAllUsers);
router.get("/managers", getManagers);
router.post("/managers", createManager);
router.put("/:id/role", setUserRole);
router.delete("/:id", deleteUser);

module.exports = router;
