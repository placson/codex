import { Router } from 'express';
import {
  getProjection,
  getUser,
  createUser,
  updateUser
} from '../controllers/userController.js';

const router = Router();

router.get('/projection', getProjection);
router.get('/', getUser);
router.post('/', createUser);
router.put('/', updateUser);

export default router;
