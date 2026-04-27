import { Router } from 'express';
import {
  getProjection,
  getUser,
  createUser,
  updateUser
} from '../controllers/userController.js';

const router = Router();

router.post('/', createUser);
router.get('/:userId/projection', getProjection);
router.get('/:userId', getUser);
router.put('/:userId', updateUser);

export default router;
