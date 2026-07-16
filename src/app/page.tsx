'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo, useCallback } from 'react';
import Script from 'next/script';
import InstallPWA from '../components/InstallPWA';
import ImageTransformControls from '../components/ImageTransformControls';
import PatternEditorWorkspace from '../components/PatternEditorWorkspace';
import LocalProjectsPanel from '../components/LocalProjectsPanel';
import BoardSettingsPanel from '../components/BoardSettingsPanel';
import ExportPanel from '../components/ExportPanel';
import type { BoardSettings } from '../core/board';
import { ImageImportError } from '../core/image/import-policy';
import {
  MAX_PROJECT_FILE_BYTES,
  ProjectError,
  parseProject,
  serializeProject,
  type PatternProject,
} from '../core/project';
import {
  createDefaultImageTransform,
  type ImageTransformSettings,
} from '../core/image/transform';
import type { GenerationMode } from '../core/pattern/generate';
import {
  GeneratorClient,
  GeneratorClientError,
} from '../features/generator/generator-client';
import { validateAndDecodeBrowserImageFile } from '../features/import/validate-browser-image';
import { createProjectFromWorkspace, DEFAULT_BOARD, restoreProjectToWorkspace } from '../features/projects/project-adapter';
import { createProjectThumbnail } from '../features/projects/project-thumbnail';
import { IndexedDbProjectStore, type ProjectSummary } from '../storage';

// 导入像素化工具和类型
import {
  PixelationMode,
  PaletteColor,
  MappedPixel,
  hexToRgb,
  findClosestPaletteColor
} from '../utils/pixelation';

import { importCsvData } from '../utils/imageDownloader';

import { 
  colorSystemOptions, 
  convertPaletteToColorSystem, 
  getColorKeyByHex,
  getMardToHexMapping,
  sortColorsByHue,
  ColorSystem 
} from '../utils/colorSystemUtils';

// 添加自定义动画样式
const floatAnimation = `
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
    100% { transform: translateY(0px); }
  }
  .animate-float {
    animation: float 3s ease-in-out infinite;
  }
`;

const sourceCodeUrl =
  process.env.NEXT_PUBLIC_SOURCE_CODE_URL ??
  'https://github.com/AngKernel/pindou-studio';

const legacyEditingOverlayEnabled = false;

// Helper function for sorting color keys - 保留原有实现，因为未在utils中导出
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// --- Define available palette key sets ---
// 从colorSystemMapping.json获取所有MARD色号
const mardToHexMapping = getMardToHexMapping();

// Pre-process the FULL palette data once - 使用colorSystemMapping而不是beadPaletteData
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 使用hex值作为key，符合新的架构设计
    return { key: hex, hex, rgb };
  })
  .filter((color): color is PaletteColor => color !== null);

// ++ Add definition for background color keys ++

// 1. 导入新组件
import PixelatedPreviewCanvas from '../components/PixelatedPreviewCanvas';
import GridTooltip from '../components/GridTooltip';
import CustomPaletteEditor from '../components/CustomPaletteEditor';
import FloatingColorPalette from '../components/FloatingColorPalette';
import FloatingToolbar from '../components/FloatingToolbar';
import MagnifierTool from '../components/MagnifierTool';
import MagnifierSelectionOverlay from '../components/MagnifierSelectionOverlay';
import { loadPaletteSelections, savePaletteSelections, presetToSelections, PaletteSelections } from '../utils/localStorageUtils';
import { TRANSPARENT_KEY, transparentColorData } from '../utils/pixelEditingUtils';

export default function Home() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<number>(50);
  const [granularityInput, setGranularityInput] = useState<string>("50");
  const [gridHeight, setGridHeight] = useState<number>(50);
  const [gridHeightInput, setGridHeightInput] = useState<string>('50');
  const [lockGridAspectRatio, setLockGridAspectRatio] = useState(true);
  const [sourceImageDimensions, setSourceImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [imageTransform, setImageTransform] = useState<ImageTransformSettings | null>(null);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(4);
  const [similarityThresholdInput, setSimilarityThresholdInput] = useState<string>('4');
  const [maximumColors, setMaximumColors] = useState(24);
  const [minimumRegionSize, setMinimumRegionSize] = useState(2);
  const [generationStatus, setGenerationStatus] = useState<{
    state: 'idle' | 'running' | 'complete' | 'error';
    completed: number;
    total: number;
    message?: string;
    processingMs?: number;
  }>({ state: 'idle', completed: 0, total: 0 });
  // 添加像素化模式状态
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.Dominant); // 默认为卡通模式
  
  // 新增：色号系统选择状态
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');
  
  const [activeBeadPalette, setActiveBeadPalette] = useState<PaletteColor[]>(() => {
      return fullBeadPalette; // 默认使用全部颜色
  });
  // 状态变量：存储被排除的颜色（hex值）
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState<boolean>(false);
  // 用于记录初始网格颜色（hex值），用于显示排除功能
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [colorCounts, setColorCounts] = useState<{ [key: string]: { count: number; color: string } } | null>(null);
  const [totalBeadCount, setTotalBeadCount] = useState<number>(0);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, key: string, color: string } | null>(null);
  const [remapTrigger, setRemapTrigger] = useState<number>(0);
  const [isManualColoringMode, setIsManualColoringMode] = useState<boolean>(false);
  const [selectedColor, setSelectedColor] = useState<MappedPixel | null>(null);
  // 新增：一键擦除模式状态
  const [isEraseMode, setIsEraseMode] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [isCustomPalette, setIsCustomPalette] = useState<boolean>(false);
  
  // 新增：高亮相关状态
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);

  // 新增：完整色板切换状态
  const [showFullPalette, setShowFullPalette] = useState<boolean>(false);
  
  // 新增：颜色替换相关状态
  const [colorReplaceState, setColorReplaceState] = useState<{
    isActive: boolean;
    step: 'select-source' | 'select-target';
    sourceColor?: { key: string; color: string };
  }>({
    isActive: false,
    step: 'select-source'
  });

  // 新增：组件挂载状态
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 新增：悬浮调色盘状态
  const [isFloatingPaletteOpen, setIsFloatingPaletteOpen] = useState<boolean>(true);

  // 新增：放大镜状态
  const [isMagnifierActive, setIsMagnifierActive] = useState<boolean>(false);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // 新增：活跃工具层级管理
  const [activeFloatingTool, setActiveFloatingTool] = useState<'palette' | 'magnifier' | null>(null);

  // 新增：编辑撤回历史栈（多步）
  interface EditSnapshot {
    mappedPixelData: MappedPixel[][];
    colorCounts: { [key: string]: { count: number; color: string } };
    totalBeadCount: number;
  }
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([]);

  // 新增：一键去背景撤回快照（单步）
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 新增：轻量提示
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [activeProjectSnapshot, setActiveProjectSnapshot] = useState<PatternProject | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('未命名项目');
  const [projectSaveState, setProjectSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [projectMessage, setProjectMessage] = useState<string | null>(null);
  const [restoredProjectMode, setRestoredProjectMode] = useState(false);
  const [boardSettings, setBoardSettings] = useState<BoardSettings>(DEFAULT_BOARD);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // 放大镜切换处理函数
  const handleToggleMagnifier = () => {
    const newActiveState = !isMagnifierActive;
    setIsMagnifierActive(newActiveState);
    
    // 如果关闭放大镜，清除选择区域，重新开始
    if (!newActiveState) {
      setMagnifierSelectionArea(null);
    }
  };

  // 激活工具处理函数
  const handleActivatePalette = () => {
    setActiveFloatingTool('palette');
  };

  const handleActivateMagnifier = () => {
    setActiveFloatingTool('magnifier');
  };

  // --- 撤回功能 ---

  // 保存编辑快照到历史栈
  const saveEditSnapshot = useCallback(() => {
    if (!mappedPixelData || !colorCounts) return;
    const snapshot: EditSnapshot = {
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: { ...colorCounts },
      totalBeadCount,
    };
    setEditHistory(prev => [...prev.slice(-49), snapshot]);
  }, [mappedPixelData, colorCounts, totalBeadCount]);

  // 编辑模式多步撤回
  const handleUndoEdit = useCallback(() => {
    if (editHistory.length === 0) return;
    const snapshot = editHistory[editHistory.length - 1];
    setMappedPixelData(snapshot.mappedPixelData);
    setColorCounts(snapshot.colorCounts);
    setTotalBeadCount(snapshot.totalBeadCount);
    setEditHistory(prev => prev.slice(0, -1));
    showToast('已撤回上一步');
  }, [editHistory, showToast]);

  // 一键去背景单步撤回
  const handleUndoBgRemoval = useCallback(() => {
    if (!bgRemovalSnapshot) return;
    setMappedPixelData(bgRemovalSnapshot.mappedPixelData);
    setColorCounts(bgRemovalSnapshot.colorCounts);
    setTotalBeadCount(bgRemovalSnapshot.totalBeadCount);
    setBgRemovalSnapshot(null);
    showToast('已撤回背景去除');
  }, [bgRemovalSnapshot, showToast]);

  // 清空编辑历史（参数变化、退出编辑模式等时调用）
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  // 放大镜像素编辑处理函数
  const handleMagnifierPixelEdit = (row: number, col: number, colorData: { key: string; color: string }) => {
    if (!mappedPixelData) return;

    const oldPixel = mappedPixelData[row][col];
    if (!oldPixel || oldPixel.key === colorData.key) return;

    // 创建新的像素数据
    const newMappedPixelData = mappedPixelData.map((rowData, r) =>
      rowData.map((pixel, c) => {
        if (r === row && c === col) {
          return {
            key: colorData.key,
            color: colorData.color
          } as MappedPixel;
        }
        return pixel;
      })
    );

    saveEditSnapshot();
    setMappedPixelData(newMappedPixelData);

    // 更新颜色统计
    if (colorCounts) {
      const newColorCounts = { ...colorCounts };

      // 减少原颜色的计数
      if (newColorCounts[oldPixel.key]) {
        newColorCounts[oldPixel.key].count--;
        if (newColorCounts[oldPixel.key].count === 0) {
          delete newColorCounts[oldPixel.key];
        }
      }

      // 增加新颜色的计数
      if (newColorCounts[colorData.key]) {
        newColorCounts[colorData.key].count++;
      } else {
        newColorCounts[colorData.key] = {
          count: 1,
          color: colorData.color
        };
      }

      setColorCounts(newColorCounts);

      // 更新总计数
      const newTotal = Object.values(newColorCounts).reduce((sum, item) => sum + item.count, 0);
      setTotalBeadCount(newTotal);
    }
  };

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeImageObjectUrlRef = useRef<string | null>(null);
  const imageImportTaskIdRef = useRef(0);
  const generatorClientRef = useRef<GeneratorClient | null>(null);
  const generationRequestIdRef = useRef(0);
  const projectStoreRef = useRef<IndexedDbProjectStore | null>(null);
  const currentProjectRef = useRef<PatternProject | null>(null);
  const skipNextAutosaveRef = useRef(false);
  // ++ 添加: Ref for import file input ++
  const importPaletteInputRef = useRef<HTMLInputElement>(null);
  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ Re-add touch refs needed for tooltip logic ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ Add a ref for the main element ++
  const mainRef = useRef<HTMLElement>(null);

  const refreshProjects = useCallback(async () => {
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      setProjects(await store.list());
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '无法读取本地项目列表。');
      setProjectSaveState('error');
    }
  }, []);

  useEffect(() => {
    projectStoreRef.current = new IndexedDbProjectStore();
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    const refreshActiveProject = () => {
      const id = currentProjectRef.current?.id;
      const store = projectStoreRef.current;
      if (!id || !store) return;
      void store.get(id).then((project) => {
        if (!project || currentProjectRef.current?.id !== id) return;
        currentProjectRef.current = project;
        setActiveProjectSnapshot(project);
      }).catch(() => {
        setProjectMessage('返回页面后无法刷新当前项目，请重新打开项目。');
      });
    };
    window.addEventListener('pageshow', refreshActiveProject);
    return () => window.removeEventListener('pageshow', refreshActiveProject);
  }, []);

  useEffect(() => {
    return () => {
      if (activeImageObjectUrlRef.current) {
        URL.revokeObjectURL(activeImageObjectUrlRef.current);
      }
      generatorClientRef.current?.dispose();
    };
  }, []);

  // --- Derived State ---

  // Update active palette based on selection and exclusions
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 根据选择的色号系统转换调色板
    const convertedPalette = convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem);
    setActiveBeadPalette(convertedPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // ++ 添加：当状态变化时同步更新输入框的值 ++
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setGridHeightInput(gridHeight.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, gridHeight, similarityThreshold]);

  // ++ Calculate unique colors currently on the grid for the palette ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // 使用hex值进行去重，避免多个MARD色号对应同一个目标色号系统值时产生重复key
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 存储hex值作为key，保持颜色信息
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 转换为数组并为每个hex值生成对应的色号系统显示
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 使用色相排序而不是色号排序
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  const handleEditorDataChange = useCallback((nextData: MappedPixel[][]) => {
    const nextCounts: { [key: string]: { count: number; color: string } } = {};
    let nextTotal = 0;
    for (const row of nextData) {
      for (const cell of row) {
        if (cell.isExternal) continue;
        const hex = cell.color.toUpperCase();
        const existing = nextCounts[hex];
        if (existing) existing.count += 1;
        else nextCounts[hex] = { count: 1, color: hex };
        nextTotal += 1;
      }
    }
    setMappedPixelData(nextData);
    setColorCounts(nextCounts);
    setTotalBeadCount(nextTotal);
    setInitialGridColorKeys(new Set(Object.keys(nextCounts)));
  }, []);

  // 初始化时从本地存储加载自定义色板选择
  useEffect(() => {
    // 尝试从localStorage加载
    const savedSelections = loadPaletteSelections();
    if (savedSelections && Object.keys(savedSelections).length > 0) {
      console.log('从localStorage加载的数据键数量:', Object.keys(savedSelections).length);
      // 验证加载的数据是否都是有效的hex值
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      let hasValidData = false;
      let validCount = 0;
      let invalidCount = 0;
      
      Object.entries(savedSelections).forEach(([key, value]) => {
        // 严格验证：键必须是有效的hex格式，并且存在于调色板中
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
          hasValidData = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      console.log(`验证结果: 有效键 ${validCount} 个, 无效键 ${invalidCount} 个`);
      
      if (hasValidData) {
        setCustomPaletteSelections(validSelections);
    setIsCustomPalette(true);
    } else {
        console.log('所有数据都无效，清除localStorage并重新初始化');
        // 如果本地数据无效，清除localStorage并默认选择所有颜色
        localStorage.removeItem('customPerlerPaletteSelections');
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
    } else {
      console.log('没有localStorage数据，默认选择所有颜色');
      // 如果没有保存的选择，默认选择所有颜色
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
  }, []); // 只在组件首次加载时执行

  // 更新 activeBeadPalette 基于自定义选择和排除列表
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      // 使用hex值进行排除检查
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 不进行色号系统转换，保持原始的MARD色号和hex值
    setActiveBeadPalette(newActiveBeadPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger]);

  // --- Event Handlers ---

  // 专心拼豆模式相关处理函数
  const handleEnterFocusMode = () => {
    if (!activeProjectId || projectSaveState !== 'saved') {
      showToast('请等待当前项目保存完成');
      return;
    }
    window.location.href = `/focus?project=${encodeURIComponent(activeProjectId)}`;
  };

  // 添加一个安全的文件输入触发函数
  const triggerFileInput = useCallback(() => {
    // 检查组件是否已挂载
    if (!isMounted) {
      console.warn("组件尚未完全挂载，延迟触发文件选择");
      setTimeout(() => triggerFileInput(), 200);
      return;
    }
    
    // 检查 ref 是否存在
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
      } catch (error) {
        console.error("触发文件选择失败:", error);
        // 如果直接点击失败，尝试延迟执行
        setTimeout(() => {
          try {
            fileInputRef.current?.click();
          } catch (retryError) {
            console.error("重试触发文件选择失败:", retryError);
          }
        }, 100);
      }
    } else {
      // 如果 ref 不存在，延迟重试
      console.warn("文件输入引用不存在，将在100ms后重试");
      setTimeout(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.click();
          } catch (error) {
            console.error("延迟触发文件选择失败:", error);
          }
        }
      }, 100);
    }
  }, [isMounted]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setExcludedColorKeys(new Set());
      void processFile(file);
    }
    // 重置文件输入框的值，这样用户可以重新选择同一个文件
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        setExcludedColorKeys(new Set());
        void processFile(file);
      }
    } catch (error) {
      console.error("处理拖拽文件时发生错误:", error);
      alert("处理文件时发生错误，请重试。");
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 根据mappedPixelData生成合成的originalImageSrc
  const generateSyntheticImageFromPixelData = useCallback((pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('无法创建canvas上下文');
      return '';
    }
    
    // 设置画布尺寸，每个像素用8x8像素来表示以确保清晰度
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 绘制每个像素
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          // 使用颜色，外部单元格用白色
          const color = cell.isExternal ? '#FFFFFF' : cell.color;
          ctx.fillStyle = color;
          ctx.fillRect(
            colIndex * pixelSize, 
            rowIndex * pixelSize, 
            pixelSize, 
            pixelSize
          );
        }
      });
    });
    
    // 转换为dataURL
    return canvas.toDataURL('image/png');
  }, []);

  const handleOpenProject = useCallback(async (id: string) => {
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      const project = await store.get(id);
      if (!project) throw new ProjectError('PROJECT_NOT_FOUND', '找不到要打开的本地项目。');
      const restored = restoreProjectToWorkspace(project);
      skipNextAutosaveRef.current = true;
      currentProjectRef.current = project;
      setActiveProjectSnapshot(project);
      setRestoredProjectMode(true);
      setActiveProjectId(project.id);
      setActiveProjectName(project.name);
      setSelectedColorSystem(restored.selectedColorSystem);
      setBoardSettings(project.board);
      setGridDimensions(restored.gridDimensions);
      handleEditorDataChange(restored.mappedPixelData);
      setSourceImageDimensions(null);
      setImageTransform(null);
      setGranularity(project.width);
      setGridHeight(project.height);
      setOriginalImageSrc(generateSyntheticImageFromPixelData(restored.mappedPixelData, restored.gridDimensions));
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setGenerationStatus({ state: 'idle', completed: 0, total: 0 });
      setProjectSaveState('saved');
      setProjectMessage(null);
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '无法打开本地项目。');
      setProjectSaveState('error');
    }
  }, [generateSyntheticImageFromPixelData, handleEditorDataChange]);

  const handleRenameProject = useCallback(async (id: string, currentName: string) => {
    const name = window.prompt('输入新的项目名称', currentName);
    if (name === null) return;
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      const renamed = await store.rename(id, name);
      if (activeProjectId === id) {
        currentProjectRef.current = renamed;
        setActiveProjectSnapshot(renamed);
        setActiveProjectName(renamed.name);
      }
      setProjectMessage(null);
      await refreshProjects();
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '项目重命名失败。');
    }
  }, [activeProjectId, refreshProjects]);

  const handleDuplicateProject = useCallback(async (id: string) => {
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      await store.duplicate(id);
      setProjectMessage(null);
      await refreshProjects();
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '项目复制失败。');
    }
  }, [refreshProjects]);

  const handleDeleteProject = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`确定删除“${name}”吗？此操作无法撤销。`)) return;
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      await store.delete(id);
      if (activeProjectId === id) {
        currentProjectRef.current = null;
        setActiveProjectSnapshot(null);
        setActiveProjectId(null);
        setActiveProjectName('未命名项目');
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setTotalBeadCount(0);
        setOriginalImageSrc(null);
        setRestoredProjectMode(false);
        setProjectSaveState('idle');
      }
      setProjectMessage(null);
      await refreshProjects();
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '项目删除失败。');
    }
  }, [activeProjectId, refreshProjects]);

  const handleExportProject = useCallback(async (id: string) => {
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      const project = await store.get(id);
      if (!project) throw new ProjectError('PROJECT_NOT_FOUND', '找不到要导出的本地项目。');
      const blob = new Blob([serializeProject(project)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'pindou-project'}.bead.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setProjectMessage(null);
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '项目导出失败。');
    }
  }, []);

  const handleImportProject = useCallback(async (file: File) => {
    const store = projectStoreRef.current;
    if (!store) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) {
        throw new ProjectError('PROJECT_TOO_LARGE', '项目文件不能超过 5 MB。');
      }
      let project = parseProject(await file.text());
      const existing = await store.get(project.id);
      if (existing) {
        const timestamp = new Date().toISOString();
        project = {
          ...project,
          id: crypto.randomUUID(),
          name: `${project.name.slice(0, 193)}（导入）`,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }
      await store.put(project);
      await refreshProjects();
      await handleOpenProject(project.id);
      setProjectMessage(null);
    } catch (error) {
      setProjectMessage(error instanceof ProjectError ? error.userMessage : '项目文件导入失败。');
      setProjectSaveState('error');
    }
  }, [handleOpenProject, refreshProjects]);

  useEffect(() => {
    if (!mappedPixelData || !gridDimensions) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    setProjectSaveState('saving');
    const timeout = window.setTimeout(() => {
      const store = projectStoreRef.current;
      if (!store) return;
      const now = new Date().toISOString();
      const id = activeProjectId ?? crypto.randomUUID();
      const name = activeProjectName.trim() || `拼豆项目 ${new Date().toLocaleString('zh-CN')}`;
      const previous = currentProjectRef.current?.id === id ? currentProjectRef.current : null;
      let project: PatternProject;
      try {
        project = createProjectFromWorkspace({
          id,
          name,
          mappedPixelData,
          width: gridDimensions.N,
          height: gridDimensions.M,
          paletteId: selectedColorSystem,
          generationSettings: {
            pixelationMode,
            similarityThreshold,
            maximumColors,
            minimumRegionSize,
          },
          board: boardSettings,
          thumbnailDataUrl: createProjectThumbnail(mappedPixelData, gridDimensions.N, gridDimensions.M),
          previous,
          now,
        });
      } catch (error) {
        setProjectMessage(error instanceof Error ? error.message : '无法准备本地项目数据。');
        setProjectSaveState('error');
        return;
      }
      void store.put(project)
        .then(async () => {
          currentProjectRef.current = project;
          setActiveProjectSnapshot(project);
          setActiveProjectId(project.id);
          setActiveProjectName(project.name);
          setProjectSaveState('saved');
          setProjectMessage(null);
          await refreshProjects();
        })
        .catch((error: unknown) => {
          setProjectSaveState('error');
          setProjectMessage(error instanceof ProjectError ? error.userMessage : '自动保存失败，请导出备份。');
        });
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [
    activeProjectId,
    activeProjectName,
    boardSettings,
    gridDimensions,
    mappedPixelData,
    maximumColors,
    minimumRegionSize,
    pixelationMode,
    refreshProjects,
    selectedColorSystem,
    similarityThreshold,
  ]);

  const processFile = async (file: File): Promise<void> => {
    const importTaskId = ++imageImportTaskIdRef.current;
    setImportError(null);
    setRestoredProjectMode(false);
    currentProjectRef.current = null;
    setActiveProjectSnapshot(null);
    setActiveProjectId(null);
    setActiveProjectName('未命名项目');
    setProjectSaveState('idle');
    setBoardSettings(DEFAULT_BOARD);
    // 检查文件类型
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      // 处理CSV文件
      console.log('正在导入CSV文件...');
      importCsvData(file)
        .then(({ mappedPixelData, gridDimensions }) => {
          console.log(`成功导入CSV文件: ${gridDimensions.N}x${gridDimensions.M}`);
          
          // 设置导入的数据
          setMappedPixelData(mappedPixelData);
          setGridDimensions(gridDimensions);
          setSourceImageDimensions(null);
          setImageTransform(null);
          setOriginalImageSrc(null); // CSV导入时没有原始图片
          
          // 计算颜色统计
          const colorCountsMap: { [key: string]: { count: number; color: string } } = {};
          let totalCount = 0;
          
          mappedPixelData.forEach(row => {
            row.forEach(cell => {
              if (cell && !cell.isExternal) {
                const colorKey = cell.color.toUpperCase();
                if (colorCountsMap[colorKey]) {
                  colorCountsMap[colorKey].count++;
                } else {
                  colorCountsMap[colorKey] = {
                    count: 1,
                    color: cell.color
                  };
                }
                totalCount++;
              }
            });
          });
          
          setColorCounts(colorCountsMap);
          setTotalBeadCount(totalCount);
          setInitialGridColorKeys(new Set(Object.keys(colorCountsMap)));
          
          // 根据mappedPixelData生成合成的originalImageSrc
          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          if (activeImageObjectUrlRef.current) {
            URL.revokeObjectURL(activeImageObjectUrlRef.current);
            activeImageObjectUrlRef.current = null;
          }
          setOriginalImageSrc(syntheticImageSrc);
          
          // 重置状态
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setIsEraseMode(false);
          
          // 设置格子数量为导入的尺寸，避免重新映射时尺寸被修改
          setGranularity(gridDimensions.N);
          setGranularityInput(gridDimensions.N.toString());
          
          alert(`成功导入CSV文件！图纸尺寸：${gridDimensions.N}x${gridDimensions.M}，共使用${Object.keys(colorCountsMap).length}种颜色。`);
        })
        .catch(error => {
          console.error('CSV导入失败:', error);
          alert(`CSV导入失败：${error.message}`);
        });
    } else {
      // 处理图片文件
      const applyImageSrc = (result: string) => {
        setOriginalImageSrc(result);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setTotalBeadCount(0);
        setInitialGridColorKeys(new Set()); // ++ 重置初始键 ++
        // ++ 重置横轴格子数量为默认值 ++
        const defaultGranularity = 100;
        setGranularity(defaultGranularity);
        setGranularityInput(defaultGranularity.toString());
        setRemapTrigger(prev => prev + 1); // Trigger full remap for new image
      };

      try {
        const validated = await validateAndDecodeBrowserImageFile(file);
        if (importTaskId !== imageImportTaskIdRef.current) return;

        const nextTransform = createDefaultImageTransform(validated.width, validated.height);
        const defaultGridWidth = 100;
        const defaultGridHeight = Math.max(
          10,
          Math.min(300, Math.round(defaultGridWidth * (validated.height / validated.width))),
        );
        setSourceImageDimensions({ width: validated.width, height: validated.height });
        setImageTransform(nextTransform);
        setGridHeight(defaultGridHeight);
        setGridHeightInput(defaultGridHeight.toString());

        const objectUrl = URL.createObjectURL(file);
        if (activeImageObjectUrlRef.current) {
          URL.revokeObjectURL(activeImageObjectUrlRef.current);
        }
        activeImageObjectUrlRef.current = objectUrl;
        applyImageSrc(objectUrl);
      } catch (error) {
        if (importTaskId !== imageImportTaskIdRef.current) return;
        const message =
          error instanceof ImageImportError
            ? error.userMessage
            : '无法读取图片，请确认文件未损坏后重试。';
        setImportError(message);
        setInitialGridColorKeys(new Set());
      }
      // ++ Reset manual coloring mode when a new file is processed ++
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setIsEraseMode(false);
    }
  };

  // 处理一键擦除模式切换
  const handleEraseToggle = () => {
    // 确保在手动上色模式下才能使用擦除功能
    if (!isManualColoringMode) {
      return;
    }
    
    // 如果当前在颜色替换模式，先退出替换模式
    if (colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    setIsEraseMode(!isEraseMode);
    // 如果开启擦除模式，取消选中的颜色
    if (!isEraseMode) {
      setSelectedColor(null);
    }
  };

  // ++ 新增：处理输入框变化的函数 ++
  const handleGranularityInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGranularityInput(event.target.value);
  };

  const handleGridHeightInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGridHeightInput(event.target.value);
  };

  const transformedAspectRatio = useMemo(() => {
    if (!imageTransform) return sourceImageDimensions
      ? sourceImageDimensions.height / sourceImageDimensions.width
      : 1;
    const swapsAxes = imageTransform.rotation === 90 || imageTransform.rotation === 270;
    const width = swapsAxes ? imageTransform.crop.height : imageTransform.crop.width;
    const height = swapsAxes ? imageTransform.crop.width : imageTransform.crop.height;
    return height / width;
  }, [imageTransform, sourceImageDimensions]);

  const handleImageTransformChange = (settings: ImageTransformSettings) => {
    if (!sourceImageDimensions) return;
    const x = Math.max(0, Math.min(sourceImageDimensions.width - 1, Math.round(settings.crop.x) || 0));
    const y = Math.max(0, Math.min(sourceImageDimensions.height - 1, Math.round(settings.crop.y) || 0));
    const width = Math.max(1, Math.min(sourceImageDimensions.width - x, Math.round(settings.crop.width) || 1));
    const height = Math.max(1, Math.min(sourceImageDimensions.height - y, Math.round(settings.crop.height) || 1));
    const normalizedSettings: ImageTransformSettings = {
      ...settings,
      crop: { x, y, width, height },
      scale: Math.max(0.25, Math.min(3, Number.isFinite(settings.scale) ? settings.scale : 1)),
      offsetX: Math.round(settings.offsetX) || 0,
      offsetY: Math.round(settings.offsetY) || 0,
    };
    setImageTransform(normalizedSettings);
    if (lockGridAspectRatio) {
      const swapsAxes = normalizedSettings.rotation === 90 || normalizedSettings.rotation === 270;
      const transformedWidth = swapsAxes ? normalizedSettings.crop.height : normalizedSettings.crop.width;
      const transformedHeight = swapsAxes ? normalizedSettings.crop.width : normalizedSettings.crop.height;
      const nextHeight = Math.max(10, Math.min(300, Math.round(granularity * (transformedHeight / transformedWidth))));
      setGridHeight(nextHeight);
      setGridHeightInput(nextHeight.toString());
    }
    setRemapTrigger((previous) => previous + 1);
  };

  // ++ 添加：处理相似度输入框变化的函数 ++
  const handleSimilarityThresholdInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSimilarityThresholdInput(event.target.value);
  };

  // ++ 修改：处理确认按钮点击的函数，同时处理两个参数 ++
  const handleConfirmParameters = () => {
    // 处理格子数
    const minGranularity = 10;
    const maxGranularity = 300;
    let newGranularity = parseInt(granularityInput, 10);

    if (isNaN(newGranularity) || newGranularity < minGranularity) {
      newGranularity = minGranularity;
    } else if (newGranularity > maxGranularity) {
      newGranularity = maxGranularity;
    }

    let newGridHeight = parseInt(gridHeightInput, 10);
    if (lockGridAspectRatio) {
      newGridHeight = Math.round(newGranularity * transformedAspectRatio);
    }
    if (isNaN(newGridHeight) || newGridHeight < minGranularity) {
      newGridHeight = minGranularity;
    } else if (newGridHeight > maxGranularity) {
      newGridHeight = maxGranularity;
    }

    // 处理相似度阈值
    const minSimilarity = 0;
    const maxSimilarity = 30;
    let newSimilarity = parseInt(similarityThresholdInput, 10);
    
    if (isNaN(newSimilarity) || newSimilarity < minSimilarity) {
      newSimilarity = minSimilarity;
    } else if (newSimilarity > maxSimilarity) {
      newSimilarity = maxSimilarity;
    }

    // 检查值是否有变化
    const granularityChanged = newGranularity !== granularity;
    const gridHeightChanged = newGridHeight !== gridHeight;
    const similarityChanged = newSimilarity !== similarityThreshold;
    
    if (granularityChanged) {
      console.log(`Confirming new granularity: ${newGranularity}`);
      setGranularity(newGranularity);
    }
    if (gridHeightChanged) {
      setGridHeight(newGridHeight);
    }
    
    if (similarityChanged) {
      console.log(`Confirming new similarity threshold: ${newSimilarity}`);
      setSimilarityThreshold(newSimilarity);
    }
    
    // 只有在有值变化时才触发重映射
    if (granularityChanged || gridHeightChanged || similarityChanged) {
      setRemapTrigger(prev => prev + 1);
      // 退出手动上色模式
      setIsManualColoringMode(false);
      setSelectedColor(null);
    }

    // 始终同步输入框的值
    setGranularityInput(newGranularity.toString());
    setGridHeightInput(newGridHeight.toString());
    setSimilarityThresholdInput(newSimilarity.toString());
  };

  // 添加像素化模式切换处理函数
  const handlePixelationModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as PixelationMode;
    if (Object.values(PixelationMode).includes(newMode)) {
        setPixelationMode(newMode);
        setRemapTrigger(prev => prev + 1); // 触发重新映射
        setIsManualColoringMode(false); // 退出手动模式
        setSelectedColor(null);
    } else {
        console.warn(`无效的像素化模式: ${newMode}`);
    }
  };

  // 修改pixelateImage函数接收模式参数
  const pixelateImage = (
    imageSrc: string,
    detailLevel: number,
    targetGridHeight: number,
    threshold: number,
    currentPalette: PaletteColor[],
    mode: PixelationMode,
    transformSettings: ImageTransformSettings | null,
  ) => {
    const requestId = ++generationRequestIdRef.current;
    const originalCanvas = originalCanvasRef.current;
    const pixelatedCanvas = pixelatedCanvasRef.current;
    if (!originalCanvas || !pixelatedCanvas) return;

    if (currentPalette.length === 0) {
      setGenerationStatus({
        state: 'error',
        completed: 0,
        total: 0,
        message: '调色板为空，请至少恢复一种可用颜色。',
      });
      setMappedPixelData(null);
      setGridDimensions(null);
      return;
    }

    const image = new window.Image();
    image.onerror = () => {
      if (requestId !== generationRequestIdRef.current) return;
      setGenerationStatus({
        state: 'error',
        completed: 0,
        total: 0,
        message: '无法加载图片，请重新选择文件。',
      });
    };

    image.onload = () => {
      if (requestId !== generationRequestIdRef.current) return;
      const context = originalCanvas.getContext('2d');
      if (!context) {
        setGenerationStatus({
          state: 'error',
          completed: 0,
          total: 0,
          message: '浏览器无法创建图片处理画布。',
        });
        return;
      }

      originalCanvas.width = image.width;
      originalCanvas.height = image.height;
      context.drawImage(image, 0, 0, image.width, image.height);
      const sourceImageData = context.getImageData(0, 0, image.width, image.height);
      const imageBuffer = sourceImageData.data.slice().buffer as ArrayBuffer;
      const paletteVersion = currentPalette
        .map((color, index) =>
          [index, color.key, color.hex, color.rgb.r, color.rgb.g, color.rgb.b].join(':'),
        )
        .join('|');
      const generationMode: Record<PixelationMode, GenerationMode> = {
        [PixelationMode.Dominant]: 'cartoon',
        [PixelationMode.Average]: 'realistic',
        [PixelationMode.Limited]: 'limited',
        [PixelationMode.Dither]: 'dither',
      };

      setGenerationStatus({
        state: 'running',
        completed: 0,
        total: targetGridHeight,
      });
      const client = generatorClientRef.current ?? new GeneratorClient();
      generatorClientRef.current = client;

      void client
        .generate(
          {
            image: {
              width: image.width,
              height: image.height,
              buffer: imageBuffer,
            },
            transform:
              transformSettings ?? createDefaultImageTransform(image.width, image.height),
            palette: {
              id: 'pindou-ui-palette',
              version: paletteVersion,
              colors: currentPalette.map((color, index) => ({
                id: [color.key, color.hex, index].join(':'),
                hex: color.hex,
                rgb: color.rgb,
              })),
            },
            settings: {
              gridWidth: detailLevel,
              gridHeight: targetGridHeight,
              mode: generationMode[mode],
              maximumColors: Math.max(
                1,
                Math.min(maximumColors, currentPalette.length),
              ),
              similarColorDeltaE: threshold,
              minimumRegionSize,
              cleanupPasses: minimumRegionSize > 1 ? 2 : 0,
              alphaThreshold: 128,
            },
          },
          {
            onProgress: (completed, total) => {
              if (requestId !== generationRequestIdRef.current) return;
              setGenerationStatus({ state: 'running', completed, total });
            },
          },
        )
        .then((result) => {
          if (requestId !== generationRequestIdRef.current) return;

          originalCanvas.width = result.processedImage.width;
          originalCanvas.height = result.processedImage.height;
          const processedContext = originalCanvas.getContext('2d');
          processedContext?.putImageData(
            new ImageData(
              result.processedImage.data,
              result.processedImage.width,
              result.processedImage.height,
            ),
            0,
            0,
          );

          const baseWidth = 500;
          const minimumCellSize = 4;
          const recommendedCellSize = 6;
          let outputWidth = baseWidth;
          if (result.grid.width > 100) {
            const maximumWidth = Math.min(1200, window.innerWidth * 0.9);
            outputWidth = Math.max(
              result.grid.width * minimumCellSize,
              Math.min(
                maximumWidth,
                Math.max(baseWidth, result.grid.width * recommendedCellSize),
              ),
            );
          }
          pixelatedCanvas.width = outputWidth;
          pixelatedCanvas.height = Math.round(
            outputWidth * (result.grid.height / result.grid.width),
          );

          const mappedData: MappedPixel[][] = Array.from(
            { length: result.grid.height },
            (_, row) =>
              Array.from({ length: result.grid.width }, (_, column) => {
                const index = row * result.grid.width + column;
                if (result.grid.external[index]) {
                  return { ...transparentColorData };
                }
                const paletteColor = currentPalette[result.grid.paletteIndexes[index]];
                if (!paletteColor) {
                  throw new Error('生成结果包含无效的色板索引。');
                }
                return { key: paletteColor.key, color: paletteColor.hex };
              }),
          );
          const nextColorCounts: {
            [key: string]: { count: number; color: string };
          } = {};
          let nextTotal = 0;
          for (const row of mappedData) {
            for (const cell of row) {
              if (cell.isExternal) continue;
              const existing = nextColorCounts[cell.key];
              if (existing) existing.count += 1;
              else nextColorCounts[cell.key] = { count: 1, color: cell.color };
              nextTotal += 1;
            }
          }

          setMappedPixelData(mappedData);
          setGridDimensions({
            N: result.grid.width,
            M: result.grid.height,
          });
          setColorCounts(nextColorCounts);
          setTotalBeadCount(nextTotal);
          setInitialGridColorKeys(new Set(Object.keys(nextColorCounts)));
          setGenerationStatus({
            state: 'complete',
            completed: result.grid.height,
            total: result.grid.height,
            processingMs: result.processingMs,
          });
        })
        .catch((error: unknown) => {
          if (requestId !== generationRequestIdRef.current) return;
          if (
            error instanceof GeneratorClientError &&
            error.code === 'GENERATION_CANCELLED'
          ) {
            return;
          }
          setGenerationStatus({
            state: 'error',
            completed: 0,
            total: 0,
            message:
              error instanceof Error
                ? '生成失败：' + error.message
                : '生成失败，请重试。',
          });
        });
    };

    image.src = imageSrc;
  };

  // 当 remapTrigger 变化时清空撤回历史（参数调整/颜色排除/新图上传等均会触发 remap）
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger]);

  // 修改useEffect中的pixelateImage调用，加入模式参数
  useEffect(() => {
    if (restoredProjectMode) return;
    if (originalImageSrc && activeBeadPalette.length > 0) {
       const timeoutId = setTimeout(() => {
         if (originalImageSrc && originalCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
           console.log("useEffect triggered: Processing image due to src, granularity, threshold, palette selection, mode or remap trigger.");
           pixelateImage(originalImageSrc, granularity, gridHeight, similarityThreshold, activeBeadPalette, pixelationMode, imageTransform);
         } else {
            console.warn("useEffect check failed inside timeout: Refs or active palette not ready/empty.");
         }
       }, 50);
       return () => {
         clearTimeout(timeoutId);
         generationRequestIdRef.current += 1;
         generatorClientRef.current?.cancel();
       };
    } else if (originalImageSrc && activeBeadPalette.length === 0) {
        console.warn("Image selected, but the active palette is empty after exclusions. Cannot process. Clearing preview.");
        const pixelatedCanvas = pixelatedCanvasRef.current;
        const pixelatedCtx = pixelatedCanvas?.getContext('2d');
        if (pixelatedCtx && pixelatedCanvas) {
            pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
            // Draw a message on the canvas?
            pixelatedCtx.fillStyle = '#6b7280'; // gray-500
            pixelatedCtx.font = '16px sans-serif';
            pixelatedCtx.textAlign = 'center';
            pixelatedCtx.fillText('无可用颜色，请恢复部分排除的颜色', pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts to allow user to un-exclude colors
        // setColorCounts(null);
        // setTotalBeadCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImageSrc, granularity, gridHeight, similarityThreshold, maximumColors, minimumRegionSize, customPaletteSelections, pixelationMode, remapTrigger, imageTransform, restoredProjectMode]);

  // 确保文件输入框引用在组件挂载后正确设置
  useEffect(() => {
    // 延迟执行，确保DOM完全渲染
    const timer = setTimeout(() => {
      if (!fileInputRef.current) {
        console.warn("文件输入框引用在组件挂载后仍为null，这可能会导致上传功能异常");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 设置组件挂载状态
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 添加URL重定向检查
  useEffect(() => {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;
      const targetDomain = 'https://perlerbeadsold.zippland.com/';
      
      // 排除localhost和127.0.0.1等本地开发环境
      const isLocalhost = currentHostname === 'localhost' || 
                         currentHostname === '127.0.0.1' || 
                         currentHostname.startsWith('192.168.') ||
                         currentHostname.startsWith('10.') ||
                         currentHostname.endsWith('.local');
      
      // 检查当前URL是否不是目标域名，且不是本地开发环境
      if (!currentUrl.startsWith(targetDomain) && !isLocalhost) {
        console.log(`当前URL: ${currentUrl}`);
        console.log(`目标URL: ${targetDomain}`);
        console.log('正在重定向到官方域名...');
        
        // 保留当前路径和查询参数
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const currentHash = window.location.hash;
        
        // 构建完整的目标URL
        let redirectUrl = targetDomain;
        
        // 如果不是根路径，添加路径
        if (currentPath && currentPath !== '/') {
          redirectUrl = redirectUrl.replace(/\/$/, '') + currentPath;
        }
        
        // 添加查询参数和哈希
        redirectUrl += currentSearch + currentHash;
        
        // 执行重定向
        window.location.replace(redirectUrl);
      } else if (isLocalhost) {
        console.log(`检测到本地开发环境 (${currentHostname})，跳过重定向`);
      }
    }
  }, []); // 只在组件首次挂载时执行

    // --- Handler to toggle color exclusion ---
    const handleToggleExcludeColor = (hexKey: string) => {
        const currentExcluded = excludedColorKeys;
        const isExcluding = !currentExcluded.has(hexKey);

        if (isExcluding) {
            console.log(`---------\nAttempting to EXCLUDE color: ${hexKey}`);

            // --- 确保初始颜色键已记录 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert("无法排除颜色，初始颜色数据尚未准备好，请稍候。");
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 使用初始颜色键进行重映射目标逻辑 ---
            // 1. 从初始网格颜色集合开始（hex值）
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 移除当前要排除的hex键
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 移除任何*其他*当前也被排除的hex键
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 基于剩余的hex值创建重映射调色板
            const remapTargetPalette = fullBeadPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 关键检查 ***：如果在考虑所有排除项后，没有*初始*颜色可供映射，则阻止此次排除
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert(`无法排除颜色 ${hexKey}，因为图中最初存在的其他可用颜色也已被排除。请先恢复部分其他颜色。`);
                console.log("---------");
                return; // 停止排除过程
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 查找被排除颜色的RGB值用于重映射
            const excludedColorData = fullBeadPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 检查排除颜色的数据是否存在
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert("无法排除颜色，缺少必要数据。");
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 仅在需要重映射时创建深拷贝
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 此条件正确地仅针对具有排除hex值的单元格
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 使用派生的 remapTargetPalette 查找最接近的颜色 ***
                    const replacementColor = findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette);
                        if (!firstReplacementHex) firstReplacementHex = replacementColor.hex;
                        newMappedData[j][i] = { 
                            ...cell, 
                            key: replacementColor.key, 
                            color: replacementColor.hex 
                        };
                    remappedCount++;
                }
                }
            }
            console.log(`Remapped ${remappedCount} cells. First replacement hex found was: ${firstReplacementHex || 'N/A'}`);

            // 同时更新状态
            setExcludedColorKeys(nextExcludedKeys); // 应用此颜色的排除
            setMappedPixelData(newMappedData); // 使用重映射的数据更新

            // 基于*新*映射数据重新计算计数（以hex为键）
            const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
            let newTotalCount = 0;
            newMappedData.flat().forEach(cell => {
                if (cell && cell.color && !cell.isExternal) {
                    const cellHex = cell.color.toUpperCase();
                    if (!newCounts[cellHex]) {
                        newCounts[cellHex] = { count: 0, color: cellHex };
                }
                    newCounts[cellHex].count++;
                    newTotalCount++;
                }
            });
            setColorCounts(newCounts);
            setTotalBeadCount(newTotalCount);
            console.log("State updated after exclusion and local remap based on initial grid colors.");
            console.log("---------");

            // ++ 在更新状态后，重新绘制 Canvas ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              setMappedPixelData(newMappedData);
              // 不要调用 setGridDimensions，因为颜色排除不需要改变网格尺寸
            } else {
               console.error("Canvas ref or grid dimensions missing, skipping draw call in handleToggleExcludeColor.");
            }

        } else {
            // --- Re-including ---
            console.log(`---------\nAttempting to RE-INCLUDE color: ${hexKey}`);
            console.log(`Re-including color: ${hexKey}. Triggering full remap.`);
            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.delete(hexKey);
            setExcludedColorKeys(nextExcludedKeys);
            // 此处无需重置 initialGridColorKeys，完全重映射会通过 pixelateImage 重新计算它
            setRemapTrigger(prev => prev + 1); // *** KEPT setRemapTrigger here for re-inclusion ***
            console.log("---------");
        }
        // ++ Exit manual mode if colors are excluded/included ++
        setIsManualColoringMode(false);
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

  // 一键去背景：识别边缘主色并洪水填充去除
  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert('请先生成图纸后再使用一键去背景。');
      return;
    }

    // 保存快照用于单步撤回
    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    // 去背景会大幅改变数据，清空编辑撤回历史
    setEditHistory([]);

    const { N, M } = gridDimensions;
    const borderCounts = new Map<string, number>();

    const countBorderCell = (row: number, col: number) => {
      const cell = mappedPixelData[row]?.[col];
      if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
      borderCounts.set(cell.key, (borderCounts.get(cell.key) || 0) + 1);
    };

    for (let col = 0; col < N; col++) {
      countBorderCell(0, col);
      if (M > 1) countBorderCell(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      countBorderCell(row, 0);
      if (N > 1) countBorderCell(row, N - 1);
    }

    if (borderCounts.size === 0) {
      alert('边缘没有可识别的背景颜色。');
      return;
    }

    let targetKey = '';
    let maxCount = -1;
    borderCounts.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        targetKey = key;
      }
    });

    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    const stack: { row: number; col: number }[] = [];

    const pushIfTarget = (row: number, col: number) => {
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        return;
      }
      const cell = newPixelData[row][col];
      if (!cell || cell.isExternal || cell.key !== targetKey) return;
      visited[row][col] = true;
      stack.push({ row, col });
    };

    for (let col = 0; col < N; col++) {
      pushIfTarget(0, col);
      if (M > 1) pushIfTarget(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      pushIfTarget(row, 0);
      if (N > 1) pushIfTarget(row, N - 1);
    }

    if (stack.length === 0) {
      alert('未找到可去除的背景区域。');
      return;
    }

    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      newPixelData[row][col] = { ...transparentColorData };
      pushIfTarget(row - 1, col);
      pushIfTarget(row + 1, col);
      pushIfTarget(row, col - 1);
      pushIfTarget(row, col + 1);
    }

    setMappedPixelData(newPixelData);

    const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
    let newTotalCount = 0;
    newPixelData.flat().forEach(cell => {
      if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        const cellHex = cell.color.toUpperCase();
        if (!newColorCounts[cellHex]) {
          newColorCounts[cellHex] = {
            count: 0,
            color: cellHex
          };
        }
        newColorCounts[cellHex].count++;
        newTotalCount++;
      }
    });

    setColorCounts(newColorCounts);
    setTotalBeadCount(newTotalCount);
    setInitialGridColorKeys(new Set(Object.keys(newColorCounts)));
  };

  // --- Tooltip Logic ---

  // --- Canvas Interaction ---

  // 洪水填充擦除函数
  const floodFillErase = (startRow: number, startCol: number, targetKey: string) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    
    // 使用栈实现非递归洪水填充
    const stack = [{ row: startRow, col: startCol }];
    
    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      
      // 检查边界
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        continue;
      }
      
      const currentCell = newPixelData[row][col];
      
      // 检查是否是目标颜色且不是外部区域
      if (!currentCell || currentCell.isExternal || currentCell.key !== targetKey) {
        continue;
      }
      
      // 标记为已访问
      visited[row][col] = true;
      
      // 擦除当前像素（设为透明）
      newPixelData[row][col] = { ...transparentColorData };
      
      // 添加相邻像素到栈中
      stack.push(
        { row: row - 1, col }, // 上
        { row: row + 1, col }, // 下
        { row, col: col - 1 }, // 左
        { row, col: col + 1 }  // 右
      );
    }
    
    // 更新状态
    saveEditSnapshot();
    setMappedPixelData(newPixelData);

    // 重新计算颜色统计
    if (colorCounts) {
      const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
      let newTotalCount = 0;
      
      newPixelData.flat().forEach(cell => {
        if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
          const cellHex = cell.color.toUpperCase();
          if (!newColorCounts[cellHex]) {
            newColorCounts[cellHex] = {
              count: 0,
              color: cellHex
            };
          }
          newColorCounts[cellHex].count++;
          newTotalCount++;
        }
      });
      
      setColorCounts(newColorCounts);
      setTotalBeadCount(newTotalCount);
    }
  };

  // ++ Re-introduce the combined interaction handler ++
  const handleCanvasInteraction = (
    clientX: number, 
    clientY: number, 
    pageX: number, 
    pageY: number, 
    isClick: boolean = false,
    isTouchEnd: boolean = false
  ) => {
    // 如果是触摸结束或鼠标离开事件，隐藏提示
    if (isTouchEnd) {
      setTooltipData(null);
      return;
    }

    const canvas = pixelatedCanvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) {
      setTooltipData(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const { N, M } = gridDimensions;
    const cellWidthOutput = canvas.width / N;
    const cellHeightOutput = canvas.height / M;

    const i = Math.floor(canvasX / cellWidthOutput);
    const j = Math.floor(canvasY / cellHeightOutput);

    if (i >= 0 && i < N && j >= 0 && j < M) {
      const cellData = mappedPixelData[j][i];

      // 颜色替换模式逻辑 - 选择源颜色
      if (isClick && colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行选择源颜色
          handleCanvasColorSelect({
            key: cellData.key,
            color: cellData.color
          });
          setTooltipData(null);
        }
        return;
      }

      // 一键擦除模式逻辑
      if (isClick && isEraseMode) {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 执行洪水填充擦除
          floodFillErase(j, i, cellData.key);
          setIsEraseMode(false); // 擦除完成后退出擦除模式
          setTooltipData(null);
        }
        return;
      }

      // Manual Coloring Logic - 保持原有的上色逻辑
      if (isClick && isManualColoringMode && selectedColor) {
        // 手动上色模式逻辑保持不变
        // ...现有代码...
        const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
        const currentCell = newPixelData[j]?.[i];

        if (!currentCell) return;

        const previousKey = currentCell.key;
        const wasExternal = currentCell.isExternal;
        
        let newCellData: MappedPixel;
        
        if (selectedColor.key === TRANSPARENT_KEY) {
          newCellData = { ...transparentColorData };
        } else {
          newCellData = { ...selectedColor, isExternal: false };
        }

        // Only update if state changes
        if (newCellData.key !== previousKey || newCellData.isExternal !== wasExternal) {
          saveEditSnapshot();
          newPixelData[j][i] = newCellData;
          setMappedPixelData(newPixelData);

          // Update color counts
          if (colorCounts) {
            const newColorCounts = { ...colorCounts };
            let newTotalCount = totalBeadCount;

            // 处理之前颜色的减少（使用hex值）
            if (!wasExternal && previousKey !== TRANSPARENT_KEY) {
              const previousCell = mappedPixelData[j][i];
              const previousHex = previousCell?.color?.toUpperCase();
              if (previousHex && newColorCounts[previousHex]) {
                newColorCounts[previousHex].count--;
                if (newColorCounts[previousHex].count <= 0) {
                  delete newColorCounts[previousHex];
              }
              newTotalCount--;
              }
            }

            // 处理新颜色的增加（使用hex值）
            if (!newCellData.isExternal && newCellData.key !== TRANSPARENT_KEY) {
              const newHex = newCellData.color.toUpperCase();
              if (!newColorCounts[newHex]) {
                newColorCounts[newHex] = {
                  count: 0,
                  color: newHex
                };
              }
              newColorCounts[newHex].count++;
              newTotalCount++;
            }

            setColorCounts(newColorCounts);
            setTotalBeadCount(newTotalCount);
          }
        }
        
        // 上色操作后隐藏提示
        setTooltipData(null);
      }
      // Tooltip Logic (非手动上色模式点击或悬停)
      else if (!isManualColoringMode) {
        // 只有单元格实际有内容（非背景/外部区域）才会显示提示
        if (cellData && !cellData.isExternal && cellData.key) {
          // 检查是否已经显示了提示框，并且是否点击的是同一个位置
          // 对于移动设备，位置可能有细微偏差，所以我们检查单元格索引而不是具体坐标
          if (tooltipData) {
            // 如果已经有提示框，计算当前提示框对应的格子的索引
            const tooltipRect = canvas.getBoundingClientRect();
            
            // 还原提示框位置为相对于canvas的坐标
            const prevX = tooltipData.x; // 页面X坐标
            const prevY = tooltipData.y; // 页面Y坐标
            
            // 转换为相对于canvas的坐标
            const prevCanvasX = (prevX - tooltipRect.left) * scaleX;
            const prevCanvasY = (prevY - tooltipRect.top) * scaleY;
            
            // 计算之前显示提示框位置对应的网格索引
            const prevCellI = Math.floor(prevCanvasX / cellWidthOutput);
            const prevCellJ = Math.floor(prevCanvasY / cellHeightOutput);
            
            // 如果点击的是同一个格子，则切换tooltip的显示/隐藏状态
            if (i === prevCellI && j === prevCellJ) {
              setTooltipData(null); // 隐藏提示
              return;
            }
          }
          
          // 计算相对于main元素的位置
          const mainElement = mainRef.current;
          if (mainElement) {
            const mainRect = mainElement.getBoundingClientRect();
            // 计算相对于main元素的坐标
            const relativeX = pageX - mainRect.left - window.scrollX;
            const relativeY = pageY - mainRect.top - window.scrollY;
            
            // 如果是移动/悬停到一个新的有效格子，或者点击了不同的格子，则显示提示
            setTooltipData({
              x: relativeX,
              y: relativeY,
              key: cellData.key,
              color: cellData.color,
            });
          } else {
            // 如果没有找到main元素，使用原始坐标
            setTooltipData({
              x: pageX,
              y: pageY,
              key: cellData.key,
              color: cellData.color,
            });
          }
        } else {
          // 如果点击/悬停在外部区域或背景上，隐藏提示
          setTooltipData(null);
        }
      }
    } else {
      // 如果点击/悬停在画布外部，隐藏提示
      setTooltipData(null);
    }
  };

  // 处理自定义色板中单个颜色的选择变化
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 保存自定义色板并应用
  const handleSaveCustomPalette = () => {
    savePaletteSelections(customPaletteSelections);
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 触发图像重新处理
    setRemapTrigger(prev => prev + 1);
    // 退出手动上色模式
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 新增：导出自定义色板配置 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert("当前没有选中的颜色，无法导出。");
      return;
    }

    // 导出格式：仅基于hex值
    const exportData = {
      version: "3.0", // 新版本号
      selectedHexValues: selectedHexValues,
      exportDate: new Date().toISOString(),
      totalColors: selectedHexValues.length
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-perler-palette.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ++ 新增：处理导入的色板文件 ++
  const handleImportPaletteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 检查文件格式
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error("无效的文件格式：文件必须包含 'selectedHexValues' 数组。");
        }

        console.log("检测到基于hex值的色板文件");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // 验证hex值
        importedHexValues.forEach(hex => {
          const normalizedHex = hex.toUpperCase();
          const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === normalizedHex);
          if (colorData) {
            validHexValues.push(normalizedHex);
          } else {
            invalidHexValues.push(hex);
          }
        });

        if (invalidHexValues.length > 0) {
          console.warn("导入时发现无效的hex值:", invalidHexValues);
          alert(`导入完成，但以下颜色无效已被忽略：\n${invalidHexValues.join(', ')}`);
        }

        if (validHexValues.length === 0) {
          alert("导入的文件中不包含任何有效的颜色。");
          return;
        }

        console.log(`成功验证 ${validHexValues.length} 个有效的hex值`);

        // 基于有效的hex值创建新的selections对象
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 标记为自定义
        alert(`成功导入 ${validHexValues.length} 个颜色！`);

      } catch (error) {
        console.error("导入色板配置失败:", error);
        alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        // 重置文件输入，以便可以再次导入相同的文件
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.onerror = () => {
      alert("读取文件失败。");
       // 重置文件输入
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ++ 新增：触发导入文件选择 ++
  const triggerImportPalette = () => {
    importPaletteInputRef.current?.click();
  };

  // 新增：处理颜色高亮
  const handleHighlightColor = (colorHex: string) => {
    setHighlightColorKey(colorHex);
  };

  // 新增：高亮完成回调
  const handleHighlightComplete = () => {
    setHighlightColorKey(null);
  };

  // 新增：切换完整色板显示
  const handleToggleFullPalette = () => {
    setShowFullPalette(!showFullPalette);
  };

  // 新增：处理颜色选择，同时管理模式切换
  const handleColorSelect = (colorData: { key: string; color: string; isExternal?: boolean }) => {
    // 如果选择的是橡皮擦（透明色）且当前在颜色替换模式，退出替换模式
    if (colorData.key === TRANSPARENT_KEY && colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    // 选择任何颜色（包括橡皮擦）时，都应该退出一键擦除模式
    if (isEraseMode) {
      setIsEraseMode(false);
    }
    
    // 设置选中的颜色
    setSelectedColor(colorData);
  };

  // 新增：颜色替换相关处理函数
  const handleColorReplaceToggle = () => {
    setColorReplaceState(prev => {
      if (prev.isActive) {
        // 退出替换模式
        return {
          isActive: false,
          step: 'select-source'
        };
      } else {
        // 进入替换模式
        // 只退出冲突的模式，但保持在手动上色模式下
        setIsEraseMode(false);
        setSelectedColor(null);
        return {
          isActive: true,
          step: 'select-source'
        };
      }
    });
  };

  // 新增：处理从画布选择源颜色
  const handleCanvasColorSelect = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
      // 高亮显示选中的颜色
      setHighlightColorKey(colorData.color);
      // 进入第二步：选择目标颜色
      setColorReplaceState({
        isActive: true,
        step: 'select-target',
        sourceColor: colorData
      });
    }
  };

  // 新增：执行颜色替换
  const handleColorReplace = (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    let replaceCount = 0;

    // 遍历所有像素，替换匹配的颜色
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const currentCell = newPixelData[j][i];
        if (currentCell && !currentCell.isExternal && 
            currentCell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
          // 替换颜色
          newPixelData[j][i] = {
            key: targetColor.key,
            color: targetColor.color,
            isExternal: false
          };
          replaceCount++;
        }
      }
    }

    if (replaceCount > 0) {
      // 更新像素数据
      saveEditSnapshot();
      setMappedPixelData(newPixelData);

      // 重新计算颜色统计
      if (colorCounts) {
        const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
        let newTotalCount = 0;

        newPixelData.flat().forEach(cell => {
          if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
            const cellHex = cell.color.toUpperCase();
            if (!newColorCounts[cellHex]) {
              newColorCounts[cellHex] = {
                count: 0,
                color: cellHex
              };
            }
            newColorCounts[cellHex].count++;
            newTotalCount++;
          }
        });

        setColorCounts(newColorCounts);
        setTotalBeadCount(newTotalCount);
      }

      console.log(`颜色替换完成：将 ${replaceCount} 个 ${sourceColor.key} 替换为 ${targetColor.key}`);
    }

    // 退出替换模式
    setColorReplaceState({
      isActive: false,
      step: 'select-source'
    });
    
    // 清除高亮
    setHighlightColorKey(null);
  };

  // 生成完整色板数据（用户自定义色板中选中的所有颜色）
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 根据选择的色号系统获取显示的色号
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 使用色相排序而不是色号排序
    return sortColorsByHue(selectedColors);
  }, [customPaletteSelections, selectedColorSystem]);

  return (
    <>
    {/* 添加自定义动画样式 */}
    <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
    <style dangerouslySetInnerHTML={{ __html: '@keyframes toastFadeInOut{0%{opacity:0;transform:translate(-50%,10px)}15%{opacity:1;transform:translate(-50%,0)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}' }} />
    
    {/* PWA 安装按钮 */}
    <InstallPWA />
    
    {/* ++ 修改：添加 onLoad 回调函数 ++ */}
    <Script
      async
      src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"
      strategy="lazyOnload"
      onLoad={() => {
        const basePV = 378536; // ++ 预设 PV 基数 ++
        const baseUV = 257864; // ++ 预设 UV 基数 ++

        const updateCount = (spanId: string, baseValue: number) => {
          const targetNode = document.getElementById(spanId);
          if (!targetNode) return;

          const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
              if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const currentValueText = targetNode.textContent?.trim() || '0';
                if (currentValueText !== '...') {
                  const currentValue = parseInt(currentValueText.replace(/,/g, ''), 10) || 0;
                  targetNode.textContent = (currentValue + baseValue).toLocaleString();
                  observer.disconnect(); // ++ 更新后停止观察 ++ 
                  // console.log(`Updated ${spanId} from ${currentValueText} to ${targetNode.textContent}`);
                  break; // 处理完第一个有效更新即可
                }
              }
            }
          });

          observer.observe(targetNode, { childList: true, characterData: true, subtree: true });

          // ++ 处理初始值已经是数字的情况 (如果脚本加载很快) ++
          const initialValueText = targetNode.textContent?.trim() || '0';
          if (initialValueText !== '...') {
             const initialValue = parseInt(initialValueText.replace(/,/g, ''), 10) || 0;
             targetNode.textContent = (initialValue + baseValue).toLocaleString();
             observer.disconnect(); // 已更新，无需再观察
          }
        };

        updateCount('busuanzi_value_site_pv', basePV);
        updateCount('busuanzi_value_site_uv', baseUV);
      }}
    />

    {/* Apply dark mode styles to the main container */}
    <div className="min-h-screen p-4 sm:p-6 flex flex-col items-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 font-[family-name:var(--font-geist-sans)] overflow-x-hidden">
      {/* Apply dark mode styles to the header */}
      <header className="w-full md:max-w-4xl text-center mt-6 mb-8 sm:mt-8 sm:mb-10 relative overflow-hidden">
        {/* Adjust decorative background colors for dark mode */}
        <div className="absolute top-0 left-0 w-48 h-48 bg-blue-100 dark:bg-blue-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-pink-100 dark:bg-pink-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>

        {/* Adjust decorative dots color */}
        <div className="absolute top-0 right-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>

        {/* Header content - Ultra fancy integrated logo and titles */}
        <div className="relative z-10 py-8">
          {/* Integrated super fancy logo and title container */}
          <div className="relative flex flex-col items-center">
            {/* Ultra cute hyper-detailed 16-bead icon */}
            <div className="relative mb-6 animate-float">
              <div className="relative grid grid-cols-4 gap-2 p-4 bg-white/95 dark:bg-gray-800/95 rounded-3xl shadow-2xl border-4 border-gradient-to-r from-pink-300 via-purple-300 to-blue-300 dark:border-gray-600">
                {['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400',
                  'bg-purple-400', 'bg-pink-400', 'bg-orange-400', 'bg-teal-400',
                  'bg-indigo-400', 'bg-cyan-400', 'bg-lime-400', 'bg-amber-400',
                  'bg-rose-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400'].map((color, i) => (
                  <div key={i} className="relative">
                    <div
                      className={`w-5 h-5 rounded-full ${color} transition-all duration-500 hover:scale-150 shadow-xl hover:shadow-2xl relative z-10`}
                      style={{
                        animation: `float ${2 + (i % 3)}s ease-in-out infinite ${i * 0.1}s`,
                        boxShadow: `0 0 20px ${color.includes('red') ? '#f87171' : color.includes('blue') ? '#60a5fa' : color.includes('yellow') ? '#fbbf24' : color.includes('green') ? '#4ade80' : color.includes('purple') ? '#a855f7' : color.includes('pink') ? '#f472b6' : color.includes('orange') ? '#fb923c' : color.includes('teal') ? '#2dd4bf' : color.includes('indigo') ? '#818cf8' : color.includes('cyan') ? '#22d3ee' : color.includes('lime') ? '#84cc16' : color.includes('amber') ? '#f59e0b' : color.includes('rose') ? '#fb7185' : color.includes('sky') ? '#0ea5e9' : color.includes('emerald') ? '#10b981' : '#8b5cf6'}70`
                      }}
                    ></div>
                    {/* Mini decorations around each bead */}
                    {i % 4 === 0 && <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-yellow-300 rounded-full animate-ping"></div>}
                    {i % 4 === 1 && <div className="absolute -bottom-0.5 -left-0.5 w-0.5 h-0.5 bg-pink-300 rounded-full animate-pulse"></div>}
                    {i % 4 === 2 && <div className="absolute -top-0.5 -left-0.5 w-0.5 h-0.5 bg-blue-300 rounded-full animate-bounce"></div>}
                    {i % 4 === 3 && <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 bg-purple-300 rounded-full animate-spin"></div>}
                  </div>
                ))}
              </div>
              
              {/* Super cute decorations around the icon */}
              <div className="absolute -top-3 -right-4 w-3 h-3 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-ping transform rotate-12"></div>
              <div className="absolute -top-1 -right-2 w-2 h-2 bg-gradient-to-br from-pink-400 to-purple-500 rotate-45 animate-spin"></div>
              <div className="absolute -bottom-3 -left-4 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-bounce"></div>
              <div className="absolute -bottom-1 -left-2 w-1.5 h-1.5 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-pulse"></div>
              <div className="absolute top-0 -right-1 w-1 h-1 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-100"></div>
              <div className="absolute -top-2 left-2 w-1 h-1 bg-gradient-to-br from-orange-400 to-red-500 rounded-full animate-bounce delay-200"></div>
              <div className="absolute bottom-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-indigo-400 to-purple-500 rotate-45 animate-spin delay-300"></div>
              <div className="absolute -bottom-2 right-1 w-0.5 h-0.5 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-ping delay-400"></div>
              
              {/* Extra tiny sparkles */}
              <div className="absolute -top-4 left-1 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-pulse delay-500"></div>
              <div className="absolute top-2 -left-4 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-600"></div>
              <div className="absolute -bottom-4 right-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-700"></div>
              <div className="absolute bottom-2 -right-5 w-0.5 h-0.5 bg-purple-300 rounded-full animate-pulse delay-800"></div>
            </div>

            {/* Ultra fancy brand name and tool name with hyper cute decorations */}
            <div className="relative flex flex-col items-center space-y-3">
              {/* Product name */}
              <div className="relative">
                <h1 className="relative text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 via-blue-500 to-cyan-400 tracking-wider drop-shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  Pindou Studio
                </h1>
                
                {/* Super fancy geometric decorations */}
                <div className="absolute -top-4 -right-5 w-4 h-4 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-spin transform rotate-12"></div>
                <div className="absolute -top-2 -right-2 w-2.5 h-2.5 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-0.5 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-blue-500 rotate-45 animate-pulse delay-100"></div>
                <div className="absolute -bottom-3 -left-5 w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rotate-45 animate-bounce delay-200"></div>
                <div className="absolute -bottom-1 -left-2 w-2 h-2 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-spin delay-300"></div>
                <div className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-400"></div>
                <div className="absolute -bottom-4 -right-3 w-3 h-3 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-full animate-bounce delay-500"></div>
                <div className="absolute top-1 -left-4 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rotate-45 animate-ping delay-600"></div>
                
                {/* Extra tiny sparkles around brand name */}
                <div className="absolute -top-3 left-0 w-1 h-1 bg-yellow-300 rounded-full animate-pulse delay-700"></div>
                <div className="absolute -top-2 right-3 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-800"></div>
                <div className="absolute bottom-0 -left-1 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute bottom-1 right-0 w-1 h-1 bg-purple-300 rounded-full animate-pulse delay-1000"></div>
              </div>
              
              {/* Tool name - 拼豆底稿生成器 with hyper cute style */}
              <div className="relative">
                <h2 className="relative text-xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-teal-500 via-green-500 to-emerald-400 tracking-widest transform hover:scale-102 transition-all duration-300">
                  拼豆工作台
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 tracking-widest ml-1 align-middle">竖屏版</span>
                </h2>
                
                {/* Super cute geometric shapes */}
                <div className="absolute -top-3 -left-6 w-3.5 h-3.5 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full animate-bounce delay-75"></div>
                <div className="absolute -top-1 -left-3 w-2 h-2 bg-gradient-to-br from-teal-400 to-green-500 rounded-full animate-ping delay-150"></div>
                <div className="absolute -top-0.5 -left-1 w-1 h-1 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-pulse delay-225"></div>
                <div className="absolute -top-3 -right-6 w-3 h-3 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-spin delay-300"></div>
                <div className="absolute -top-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full animate-bounce delay-375"></div>
                <div className="absolute -bottom-2 -right-3 w-2.5 h-2.5 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full animate-pulse delay-450"></div>
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-gradient-to-br from-teal-400 to-blue-500 rotate-45 animate-spin delay-525"></div>
                
                {/* Mini sparkles around tool name */}
                <div className="absolute -top-2 left-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-600"></div>
                <div className="absolute -top-1 right-2 w-1 h-1 bg-teal-300 rounded-full animate-pulse delay-675"></div>
                <div className="absolute bottom-0 left-4 w-0.5 h-0.5 bg-green-300 rounded-full animate-bounce delay-750"></div>
                <div className="absolute bottom-1 right-4 w-0.5 h-0.5 bg-emerald-300 rounded-full animate-pulse delay-825"></div>
                <div className="absolute top-2 -left-2 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute top-2 -right-2 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-975"></div>
              </div>
            </div>
            
            {/* Ultra cute floating elements constellation around the entire group */}
            <div className="absolute -top-10 -left-10 w-3 h-3 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-float"></div>
            <div className="absolute -top-8 -left-6 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rotate-45 animate-spin delay-100"></div>
            <div className="absolute -top-6 -left-12 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rounded-full animate-bounce delay-200"></div>
            
            <div className="absolute -top-10 -right-10 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-ping delay-300"></div>
            <div className="absolute -top-6 -right-14 w-1 h-1 bg-gradient-to-br from-cyan-400 to-blue-500 rotate-45 animate-pulse delay-400"></div>
            <div className="absolute -top-4 -right-8 w-3 h-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full animate-bounce delay-500"></div>
            
            <div className="absolute -bottom-10 -left-10 w-2 h-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full animate-pulse delay-600"></div>
            <div className="absolute -bottom-8 -left-14 w-1.5 h-1.5 bg-gradient-to-br from-orange-400 to-red-500 rotate-45 animate-spin delay-700"></div>
            <div className="absolute -bottom-6 -left-6 w-2.5 h-2.5 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-float delay-800"></div>
            
            <div className="absolute -bottom-10 -right-10 w-3 h-3 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-bounce delay-900"></div>
            <div className="absolute -bottom-8 -right-6 w-1 h-1 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full animate-ping delay-1000"></div>
            <div className="absolute -bottom-6 -right-14 w-2 h-2 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full animate-pulse delay-1100"></div>
            
            {/* Extra tiny magical sparkles */}
            <div className="absolute -top-12 left-0 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-ping delay-1200"></div>
            <div className="absolute -top-2 -left-16 w-1 h-1 bg-pink-300 rounded-full animate-bounce delay-1300"></div>
            <div className="absolute top-2 -right-18 w-0.5 h-0.5 bg-blue-300 rounded-full animate-pulse delay-1400"></div>
            <div className="absolute -bottom-12 right-0 w-1 h-1 bg-purple-300 rounded-full animate-float delay-1500"></div>
            <div className="absolute -bottom-2 -right-16 w-0.5 h-0.5 bg-green-300 rounded-full animate-ping delay-1600"></div>
            <div className="absolute bottom-2 -left-18 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-1700"></div>
          </div>
          {/* Slogan */}
          <p className="mt-3 text-sm sm:text-base font-light text-gray-500 dark:text-gray-400 text-center tracking-[0.15em]">
            让像素创意属于每一个人
          </p>

          {/* 项目与许可入口 */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs">
            <a href={sourceCodeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 0C5.37 0 0 5.48 0 12.25c0 5.42 3.44 10.01 8.2 11.63.6.12.82-.27.82-.6 0-.3-.01-1.08-.02-2.13-3.34.74-4.04-1.65-4.04-1.65-.55-1.44-1.35-1.83-1.35-1.83-1.1-.78.08-.77.08-.77 1.21.09 1.85 1.26 1.85 1.26 1.08 1.9 2.83 1.35 3.52 1.03.11-.81.42-1.35.77-1.66-2.66-.31-5.46-1.36-5.46-6.06 0-1.34.46-2.43 1.22-3.29-.12-.31-.53-1.55.12-3.23 0 0 1-.33 3.29 1.25a10.96 10.96 0 0 1 5.98 0c2.29-1.58 3.29-1.25 3.29-1.25.65 1.68.24 2.92.12 3.23.76.86 1.22 1.95 1.22 3.29 0 4.71-2.81 5.74-5.49 6.05.43.38.81 1.13.81 2.28 0 1.65-.02 2.98-.02 3.39 0 .33.22.72.83.59C20.56 22.25 24 17.67 24 12.25 24 5.48 18.63 0 12 0Z" />
              </svg>
              获取源码
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <a href="/licenses" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">
              开源许可
            </a>
          </div>
          {/* 来源提示 */}
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">发布平台请标注来源或保留图片水印及标识</p>
        </div>
      </header>

      {/* Apply dark mode styles to the main section */}
      <main ref={mainRef} className="w-full md:max-w-4xl flex flex-col items-center space-y-5 sm:space-y-6 relative overflow-hidden">
        <LocalProjectsPanel
          projects={projects}
          activeProjectId={activeProjectId}
          activeProjectName={activeProjectName}
          saveState={projectSaveState}
          message={projectMessage}
          onOpen={(id) => { void handleOpenProject(id); }}
          onRename={(id, name) => { void handleRenameProject(id, name); }}
          onDuplicate={(id) => { void handleDuplicateProject(id); }}
          onDelete={(id, name) => { void handleDeleteProject(id, name); }}
          onExport={(id) => { void handleExportProject(id); }}
          onImport={(file) => { void handleImportProject(file); }}
        />
        {/* Apply dark mode styles to the Drop Zone */}
        <div
          data-testid="image-drop-zone"
          onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragOver}
          onClick={isMounted ? triggerFileInput : undefined}
          className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center ${isMounted ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-800' : 'cursor-wait'} transition-all duration-300 w-full md:max-w-md flex flex-col justify-center items-center shadow-sm hover:shadow-md`}
          style={{ minHeight: '130px' }}
        >
          {/* Icon color */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500 mb-2 sm:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {/* Text color */}
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">拖放图片到此处，或<span className="font-medium text-blue-600 dark:text-blue-400">点击选择文件</span></p>
          {/* Text color */}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">支持 JPG、PNG、WebP 图片（最大 20 MB），或 CSV 数据文件</p>
        </div>

        {importError && (
          <div role="alert" className="w-full md:max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            {importError}
          </div>
        )}

        {/* Apply dark mode styles to the Tip Box */}
        {!originalImageSrc && (
          <div className="w-full md:max-w-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 p-3 rounded-lg border border-blue-100 dark:border-gray-600 shadow-sm">
            {/* Icon color */}
            <p className="text-xs text-indigo-700 dark:text-indigo-300 flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 flex-shrink-0 text-blue-500 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {/* Text color */}
              <span className="text-indigo-700 dark:text-indigo-300">小贴士：使用像素图进行转换前，请确保图片的边缘吻合像素格子的边界线，这样可以获得更精确的切割效果和更好的成品。</span>
            </p>
          </div>
        )}

                      <input data-testid="image-file-input" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.csv,text/csv,application/csv" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

        {/* Controls and Output Area */}
        {originalImageSrc && (
          <div className="w-full flex flex-col items-center space-y-5 sm:space-y-6">
            {/* ++ HIDE Control Row in manual mode ++ */}
            {!isManualColoringMode && (
              /* 修改控制面板网格布局 */
              <div className="w-full md:max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                {/* Granularity Input */}
                <div className="flex-1">
                  {/* Label color */}
                  <label htmlFor="granularityInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    横轴切割数量 (10-300):
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Input field styles */}
                    <input
                      type="number"
                      id="granularityInput"
                      value={granularityInput}
                      onChange={handleGranularityInputChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                      min="10"
                      max="300"
                    />
                  </div>
                </div>

                <div className="flex-1">
                  <label htmlFor="gridHeightInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    纵轴切割数量 (10-300):
                  </label>
                  <input
                    type="number"
                    id="gridHeightInput"
                    value={gridHeightInput}
                    onChange={handleGridHeightInputChange}
                    disabled={lockGridAspectRatio}
                    className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 disabled:opacity-60"
                    min="10"
                    max="300"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={lockGridAspectRatio}
                      onChange={(event) => {
                        const locked = event.target.checked;
                        setLockGridAspectRatio(locked);
                        if (locked) {
                          const nextHeight = Math.max(10, Math.min(300, Math.round(granularity * transformedAspectRatio)));
                          setGridHeight(nextHeight);
                          setGridHeightInput(nextHeight.toString());
                          setRemapTrigger((previous) => previous + 1);
                        }
                      }}
                    />
                    锁定处理区域宽高比
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    目标格数：{granularityInput || 0}×{lockGridAspectRatio ? Math.max(10, Math.min(300, Math.round((Number(granularityInput) || 0) * transformedAspectRatio))) : gridHeightInput || 0}
                  </p>
                </div>

                {/* Similarity Threshold Input */}
                <div className="flex-1">
                    {/* Label color */}
                    <label htmlFor="similarityThresholdInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                        相似色合并 ΔE (0-30):
                    </label>
                    <div className="flex items-center gap-2">
                      {/* Input field styles */}
                      <input
                        type="number"
                        id="similarityThresholdInput"
                        value={similarityThresholdInput}
                        onChange={handleSimilarityThresholdInputChange}
                        className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                        min="0"
                        max="30"
                      />
                    </div>
                </div>

                <div className="flex-1">
                  <label htmlFor="maximumColorsInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    最大颜色数 (1-{Math.max(1, activeBeadPalette.length)}):
                  </label>
                  <input
                    id="maximumColorsInput"
                    type="number"
                    min="1"
                    max={Math.max(1, activeBeadPalette.length)}
                    value={maximumColors}
                    onChange={(event) => setMaximumColors(Math.max(1, Math.min(activeBeadPalette.length, Number(event.target.value) || 1)))}
                    className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                  />
                </div>

                <div className="flex-1">
                  <label htmlFor="minimumRegionSizeInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    最小色块 (1-12 格):
                  </label>
                  <input
                    id="minimumRegionSizeInput"
                    type="number"
                    min="1"
                    max="12"
                    value={minimumRegionSize}
                    onChange={(event) => setMinimumRegionSize(Math.max(1, Math.min(12, Number(event.target.value) || 1)))}
                    className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                  />
                </div>

                {sourceImageDimensions && imageTransform && (
                  <ImageTransformControls
                    sourceDimensions={sourceImageDimensions}
                    settings={imageTransform}
                    onChange={handleImageTransformChange}
                  />
                )}

                {/* 快捷按钮 */}
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleConfirmParameters}
                    className="h-9 bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 rounded-md whitespace-nowrap transition-colors duration-200 shadow-sm"
                  >
                    应用数字
                  </button>
                  <button
                    onClick={handleAutoRemoveBackground}
                    disabled={!mappedPixelData || !gridDimensions}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    一键去背景
                  </button>
                  <button
                    onClick={handleUndoBgRemoval}
                    disabled={!bgRemovalSnapshot}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    回撤上一步
                  </button>
                </div>

                {/* Pixelation Mode Selector */}
                <div className="sm:col-span-2">
                  {/* Label color */}
                  <label htmlFor="pixelationModeSelect" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">处理模式:</label>
                  <div className="flex items-center gap-2">
                    {/* Select field styles */}
                    <select
                      id="pixelationModeSelect"
                      value={pixelationMode}
                      onChange={handlePixelationModeChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                    >
                      <option value={PixelationMode.Dominant} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">卡通 (主色)</option>
                      <option value={PixelationMode.Average} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">真实 (平均)</option>
                      <option value={PixelationMode.Limited} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">少色 (主色 + 限色)</option>
                      <option value={PixelationMode.Dither} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">抖动 (Floyd–Steinberg)</option>
                    </select>
                  </div>
                </div>

                {/* 色号系统选择器 */}
                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">色号系统:</label>
                  <div className="flex flex-wrap gap-2">
                    {colorSystemOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => setSelectedColorSystem(option.key as ColorSystem)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex-shrink-0 ${
                          selectedColorSystem === option.key
                            ? 'bg-blue-500 text-white border-blue-500 shadow-md transform scale-105'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 自定义色板按钮 */}
                <div className="sm:col-span-2 mt-3">
                  <button
                    onClick={() => setIsCustomPaletteEditorOpen(true)}
                    className="w-full py-2.5 px-3 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:from-blue-600 hover:to-purple-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                    </svg>
                    管理色板 ({Object.values(customPaletteSelections).filter(Boolean).length} 色)
                  </button>
                  {isCustomPalette && (
                    <p className="text-xs text-center text-blue-500 dark:text-blue-400 mt-1.5">当前使用自定义色板</p>
                  )}
                </div>
              </div>
            )}

            {/* 自定义色板编辑器弹窗 - 这是新增的部分 */}
            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                   {/* 添加隐藏的文件输入框 */}
                   <input
                    type="file"
                    accept=".json"
                    ref={importPaletteInputRef}
                    onChange={handleImportPaletteFile}
                    className="hidden"
                  />
                  <div className="p-4 sm:p-6 flex-1 overflow-y-auto"> {/* 让内容区域可滚动 */}
                    <CustomPaletteEditor
                      allColors={fullBeadPalette}
                      currentSelections={customPaletteSelections}
                      onSelectionChange={handleSelectionChange}
                      onSaveCustomPalette={handleSaveCustomPalette}
                      onClose={() => setIsCustomPaletteEditorOpen(false)}
                      onExportCustomPalette={handleExportCustomPalette}
                      onImportCustomPalette={triggerImportPalette}
                      selectedColorSystem={selectedColorSystem}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Output Section */}
              <div className={isManualColoringMode ? 'w-full md:max-w-6xl' : 'w-full md:max-w-2xl'}>
              <div className={isManualColoringMode ? 'hidden' : 'mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-800'}>
                <p className="mb-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300">预处理原图</p>
                <div className="flex justify-center overflow-auto rounded-lg bg-gray-100 p-2 dark:bg-gray-700">
                  <canvas ref={originalCanvasRef} className="block h-auto max-h-80 max-w-full rounded" />
                </div>

                <div data-testid="generation-status" className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                  {generationStatus.state === 'running' && (
                    <div className="flex items-center gap-3">
                      <progress className="h-2 flex-1" max={Math.max(1, generationStatus.total)} value={generationStatus.completed} />
                      <span>{generationStatus.completed}/{generationStatus.total}</span>
                      <button
                        type="button"
                        onClick={() => {
                          generationRequestIdRef.current += 1;
                          generatorClientRef.current?.cancel();
                          setGenerationStatus({ state: 'idle', completed: 0, total: 0, message: '生成任务已取消。' });
                        }}
                        className="rounded border border-blue-300 bg-white px-2 py-1 text-blue-700 dark:border-blue-700 dark:bg-gray-900 dark:text-blue-200"
                      >
                        取消
                      </button>
                    </div>
                  )}
                  {generationStatus.state === 'complete' && (
                    <span>生成完成{generationStatus.processingMs === undefined ? '' : `，Worker 耗时 ${generationStatus.processingMs.toFixed(1)} ms`}。</span>
                  )}
                  {generationStatus.state === 'error' && <span role="alert">{generationStatus.message}</span>}
                  {generationStatus.state === 'idle' && <span>{generationStatus.message ?? '调整参数后会自动在后台重新生成。'}</span>}
                </div>
              </div>

              {/* ++ 手动编辑模式提示信息 ++ */}
              {isManualColoringMode && mappedPixelData && gridDimensions && (
                <div className="w-full mb-4 p-3 bg-blue-50 dark:bg-gray-800 rounded-lg shadow-sm border border-blue-100 dark:border-gray-700">
                  <div className="flex justify-center">
                    <div className="bg-blue-50 dark:bg-gray-700 border border-blue-100 dark:border-gray-600 rounded-lg p-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs text-gray-600 dark:text-gray-300 w-full sm:w-auto">
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>使用右上角菜单操作</span>
                      </div>
                      <span className="hidden sm:inline text-gray-300 dark:text-gray-500">|</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>推荐电脑操作，上色更精准</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Canvas Preview Container */}
              {/* Apply dark mode styles */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                <p className="mb-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300">拼豆生成结果</p>
                {/* 大画布提示信息 */}
                {gridDimensions && gridDimensions.N > 100 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>高精度网格 ({gridDimensions.N}×{gridDimensions.M}) - 画布已自动放大，可左右滚动、放大查看精细图像</span>
                    </div>
                  </div>
                )}
                 {/* Inner container background - 允许水平滚动以适应大画布 */}
                 {isManualColoringMode && mappedPixelData && gridDimensions ? (
                   <PatternEditorWorkspace
                     key={`${originalImageSrc}-${gridDimensions.N}x${gridDimensions.M}`}
                     initialData={mappedPixelData}
                     gridDimensions={gridDimensions}
                     palette={activeBeadPalette}
                     originalImageSrc={originalImageSrc}
                     boardSettings={boardSettings}
                     onChange={handleEditorDataChange}
                     onExit={() => {
                       setIsManualColoringMode(false);
                       setSelectedColor(null);
                       setTooltipData(null);
                     }}
                   />
                 ) : (
                   <div className="flex justify-center mb-3 sm:mb-4 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg overflow-x-auto overflow-y-hidden" style={{ minHeight: '150px' }}>
                     <PixelatedPreviewCanvas
                       canvasRef={pixelatedCanvasRef}
                       mappedPixelData={mappedPixelData}
                       gridDimensions={gridDimensions}
                       isManualColoringMode={false}
                       onInteraction={handleCanvasInteraction}
                       highlightColorKey={highlightColorKey}
                       onHighlightComplete={handleHighlightComplete}
                     />
                   </div>
                 )}
              </div>
            </div>
          </div> // This closes the main div started after originalImageSrc check
        )}

        {/* ++ HIDE Color Counts in manual mode ++ */}
        {!isManualColoringMode && originalImageSrc && colorCounts && Object.keys(colorCounts).length > 0 && (
          // Apply dark mode styles to color counts container
          <div className="w-full md:max-w-2xl mt-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-700 color-stats-panel">
            {/* Title color */}
            <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200 text-center">
              去除杂色 
            </h3>
            {/* Subtitle color */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">点击下方列表中的颜色可将其从可用列表中排除。总计: {totalBeadCount} 颗</p>
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-2 text-sm">
              {Object.keys(colorCounts)
                .sort(sortColorKeys)
                .map((hexKey) => {
                  // 现在key是hex值，需要通过hex获取对应色号系统的色号
                  const displayColorKey = getColorKeyByHex(hexKey, selectedColorSystem);
                  const isExcluded = excludedColorKeys.has(hexKey);
                  const count = colorCounts[hexKey].count;
                  const colorHex = colorCounts[hexKey].color;

                  return (
                    <li
                      key={hexKey}
                      onClick={() => handleToggleExcludeColor(hexKey)}
                       // Apply dark mode styles for list items (normal and excluded)
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${ 
                        isExcluded
                          ? 'bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 opacity-60 dark:opacity-70' // Darker red background for excluded
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={isExcluded ? `点击恢复 ${displayColorKey}` : `点击排除 ${displayColorKey}`}
                    >
                      <div className={`flex items-center space-x-2 ${isExcluded ? 'line-through' : ''}`}>
                        {/* Adjust color swatch border */}
                        <span
                          className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                          style={{ backgroundColor: isExcluded ? '#666' : colorHex }} // Darker gray for excluded swatch
                        ></span>
                        {/* Adjust text color for key (normal and excluded) */}
                        <span className={`font-mono font-medium ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{displayColorKey}</span>
                      </div>
                      {/* Adjust text color for count (normal and excluded) */}
                      <span className={`text-xs ${isExcluded ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-300'}`}>{count} 颗</span>
                    </li>
                  );
                })}
            </ul>
            {excludedColorKeys.size > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowExcludedColors(prev => !prev)}
                    className="w-full text-xs py-1.5 px-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-between"
                  >
                    <span>已排除的颜色 ({excludedColorKeys.size})</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${showExcludedColors ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExcludedColors && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md p-2 bg-gray-100 dark:bg-gray-800">
                      <div className="max-h-40 overflow-y-auto">
                        {Array.from(excludedColorKeys).length > 0 ? (
                          <ul className="space-y-1">
                            {Array.from(excludedColorKeys).sort(sortColorKeys).map(hexKey => {
                              const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === hexKey.toUpperCase());
                              return (
                                <li key={hexKey} className="flex justify-between items-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                                      style={{ backgroundColor: colorData?.hex || hexKey }}
                                    ></span>
                                    <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{getColorKeyByHex(hexKey, selectedColorSystem)}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      // 实现恢复单个颜色的逻辑
                                      const newExcludedKeys = new Set(excludedColorKeys);
                                      newExcludedKeys.delete(hexKey);
                                      setExcludedColorKeys(newExcludedKeys);
                                      setRemapTrigger(prev => prev + 1);
                                      setIsManualColoringMode(false);
                                      setSelectedColor(null);
                                      console.log(`Restored color: ${hexKey}`);
                                    }}
                                    className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40"
                                  >
                                    恢复
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                            没有排除的颜色
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          // 恢复所有颜色的逻辑
                          setExcludedColorKeys(new Set());
                          setRemapTrigger(prev => prev + 1);
                          setIsManualColoringMode(false);
                          setSelectedColor(null);
                          console.log("Restored all excluded colors");
                        }}
                        className="mt-2 w-full text-xs py-1 px-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        一键恢复所有颜色
                      </button>
                    </div>
                  )}
                </div>
            )}
          </div>
        )} {/* ++ End of HIDE Color Counts ++ */}

        {/* Message if palette becomes empty (Also hide in manual mode) */}
         {!isManualColoringMode && originalImageSrc && activeBeadPalette.length === 0 && excludedColorKeys.size > 0 && (
             // Apply dark mode styles to the warning box
             <div className="w-full md:max-w-2xl mt-6 bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded-lg shadow border border-yellow-200 dark:border-yellow-800/60 text-center text-sm text-yellow-800 dark:text-yellow-300">
                 当前可用颜色过少或为空。请在上方统计列表中查看已排除的颜色并恢复部分，或更换色板。
                 {excludedColorKeys.size > 0 && (
                      // Apply dark mode styles to the inline "restore all" button
                      <button
                          onClick={() => {
                            setShowExcludedColors(true); // 展开排除颜色列表
                            // 滚动到颜色列表处
                            setTimeout(() => {
                              const listElement = document.querySelector('.color-stats-panel');
                              if (listElement) {
                                listElement.scrollIntoView({ behavior: 'smooth' });
                              }
                            }, 100);
                          }}
                          className="mt-2 ml-2 text-xs py-1 px-2 bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-300 dark:hover:bg-yellow-600/70 transition-colors"
                      >
                          查看已排除颜色 ({excludedColorKeys.size})
                      </button>
                  )}
             </div>
         )}

        {/* ++ RENDER Enter Manual Mode Button ONLY when NOT in manual mode (before downloads) ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && gridDimensions && (
            <div className="w-full md:max-w-2xl mt-4 space-y-3"> {/* Wrapper div */} 
             <BoardSettingsPanel
               settings={boardSettings}
               patternWidth={gridDimensions.N}
               patternHeight={gridDimensions.M}
               canEnterMaker={activeProjectId !== null && projectSaveState === 'saved'}
               onChange={setBoardSettings}
               onEnterMaker={handleEnterFocusMode}
             />
             {/* Manual Edit Mode Button */}
             <button
                onClick={() => {
                  setIsManualColoringMode(true); // Enter mode
                  setSelectedColor(null);
                  setTooltipData(null);
                }}
                className={`w-full py-2.5 px-4 text-sm sm:text-base rounded-lg transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg hover:translate-y-[-1px]`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /> </svg>
                 进入手动编辑模式
             </button>

            </div>
        )} {/* ++ End of RENDER Enter Manual Mode Button ++ */}

        {/* ++ HIDE Export Panel in manual mode ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && (
            <div className="w-full md:max-w-2xl mt-4">
              <ExportPanel project={projectSaveState === 'saved' ? activeProjectSnapshot : null} />
            </div>
        )} {/* ++ End of HIDE Export Panel ++ */}

         {/* Tooltip Display (Needs update in GridTooltip.tsx) */}
         {tooltipData && (
            <GridTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
          )}

      </main>

      {/* 悬浮工具栏 */}
      {legacyEditingOverlayEnabled && <FloatingToolbar
        isManualColoringMode={isManualColoringMode}
        isPaletteOpen={isFloatingPaletteOpen}
        onTogglePalette={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
        onExitManualMode={() => {
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setTooltipData(null);
          setIsEraseMode(false);
          setColorReplaceState({
            isActive: false,
            step: 'select-source'
          });
          setHighlightColorKey(null);
          setIsMagnifierActive(false);
          setMagnifierSelectionArea(null);
          clearEditHistory();
        }}
        onToggleMagnifier={handleToggleMagnifier}
        isMagnifierActive={isMagnifierActive}
      />}

      {/* 悬浮调色盘 */}
      {legacyEditingOverlayEnabled && isManualColoringMode && (
        <FloatingColorPalette
          colors={currentGridColors}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          selectedColorSystem={selectedColorSystem}
          isEraseMode={isEraseMode}
          onEraseToggle={handleEraseToggle}
          fullPaletteColors={fullPaletteColors}
          showFullPalette={showFullPalette}
          onToggleFullPalette={handleToggleFullPalette}
          colorReplaceState={colorReplaceState}
          onColorReplaceToggle={handleColorReplaceToggle}
          onColorReplace={handleColorReplace}
          onHighlightColor={handleHighlightColor}
          isOpen={isFloatingPaletteOpen}
          onToggleOpen={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
          isActive={activeFloatingTool === 'palette'}
          onActivate={handleActivatePalette}
          canUndo={editHistory.length > 0}
          onUndo={handleUndoEdit}
        />
      )}

      {/* 放大镜工具 */}
      {legacyEditingOverlayEnabled && isManualColoringMode && (
        <>
          <MagnifierTool
            isActive={isMagnifierActive}
            onToggle={handleToggleMagnifier}
            mappedPixelData={mappedPixelData}
            gridDimensions={gridDimensions}
            selectedColor={selectedColor}
            selectedColorSystem={selectedColorSystem}
            onPixelEdit={handleMagnifierPixelEdit}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            selectionArea={magnifierSelectionArea}
            onClearSelection={() => setMagnifierSelectionArea(null)}
            isFloatingActive={activeFloatingTool === 'magnifier'}
            onActivateFloating={handleActivateMagnifier}
            highlightColorKey={highlightColorKey}
          />
          
          {/* 放大镜选择覆盖层 */}
          <MagnifierSelectionOverlay
            isActive={isMagnifierActive && !magnifierSelectionArea}
            canvasRef={pixelatedCanvasRef}
            gridDimensions={gridDimensions}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            onSelectionComplete={setMagnifierSelectionArea}
          />
        </>
      )}

      {/* Apply dark mode styles to the Footer */}
      <footer className="w-full md:max-w-4xl mt-10 mb-6 py-6 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800/50 rounded-lg shadow-inner">

        {/* Copyright text color */}
        <p className="font-medium text-gray-600 dark:text-gray-300">
          Pindou Studio &copy; {new Date().getFullYear()}
        </p>
      </footer>

      {/* 轻量提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-[200] text-sm whitespace-nowrap"
             style={{ animation: 'toastFadeInOut 2s ease-in-out' }}>
          {toastMessage}
        </div>
      )}
    </div>
   </>
  );
}
